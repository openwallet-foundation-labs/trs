import datetime as dt
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID, ObjectIdentifier

D = lambda y, m=1, d=1: dt.datetime(y, m, d, tzinfo=dt.timezone.utc)
k = lambda: ec.generate_private_key(ec.SECP256R1())


def name(cn):
    return x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "ZZ"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Example PKI"),
        x509.NameAttribute(NameOID.COMMON_NAME, cn),
    ])


def ku(**on):
    flags = dict(digital_signature=False, content_commitment=False, key_encipherment=False,
                 data_encipherment=False, key_agreement=False, key_cert_sign=False,
                 crl_sign=False, encipher_only=False, decipher_only=False)
    flags.update(on)
    return x509.KeyUsage(**flags)


def cert(cn, key, issuer=None, ca=False, path_length=None, nb=D(2020), na=D(2040),
         eku=None, crl=None, serial=None, extra=None):
    issuer_name, issuer_key = issuer or (name(cn), key)
    b = (x509.CertificateBuilder()
         .subject_name(name(cn)).issuer_name(issuer_name)
         .public_key(key.public_key())
         .serial_number(serial or x509.random_serial_number())
         .not_valid_before(nb).not_valid_after(na)
         .add_extension(x509.BasicConstraints(ca=ca, path_length=path_length), critical=True)
         .add_extension(ku(key_cert_sign=True, crl_sign=True) if ca else ku(digital_signature=True), critical=True)
         .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False))
    if eku:
        b = b.add_extension(x509.ExtendedKeyUsage(eku), critical=False)
    if crl:
        b = b.add_extension(x509.CRLDistributionPoints([x509.DistributionPoint(
            [x509.UniformResourceIdentifier(crl)], None, None, None)]), critical=False)
    for ext, critical in extra or []:
        b = b.add_extension(ext, critical=critical)
    return b.sign(issuer_key, hashes.SHA256())


def save(fn, obj):
    open(fn, "wb").write(obj.public_bytes(serialization.Encoding.PEM))


def crl(issuer_cert, issuer_key, revoked, this_update=D(2025), next_update=D(2045)):
    b = (x509.CertificateRevocationListBuilder().issuer_name(issuer_cert.subject)
         .last_update(this_update).next_update(next_update)
         .add_extension(x509.CRLNumber(1), critical=False))
    for serial, when in revoked:
        b = b.add_revoked_certificate(x509.RevokedCertificateBuilder()
                                      .serial_number(serial).revocation_date(when).build())
    return b.sign(issuer_key, hashes.SHA256())


root_key, int_key, sub_key, rogue_key, valid_key = k(), k(), k(), k(), k()
root = cert("Example Root CA", root_key, ca=True, nb=D(2015), na=D(2045))
inter = cert("Example Issuing CA", int_key, (root.subject, root_key), ca=True, path_length=0,
             nb=D(2015), na=D(2045), crl="http://pki.test/root.crl")
by_int = (inter.subject, int_key)
LEAF = dict(eku=[ExtendedKeyUsageOID.SERVER_AUTH], crl="http://pki.test/issuing.crl")

valid = cert("valid.example", valid_key, by_int, **LEAF)
save("root.pem", root)
save("intermediate.pem", inter)
save("leaf-valid.pem", valid)
save("leaf-expired.pem", cert("expired.example", k(), by_int, nb=D(2016), na=D(2017), **LEAF))
revoked = cert("revoked.example", k(), by_int, serial=0x5EC0DE, **LEAF)
save("leaf-revoked.pem", revoked)
save("leaf-client.pem", cert("client.example", k(), by_int,
                             eku=[ExtendedKeyUsageOID.CLIENT_AUTH], crl=LEAF["crl"]))
save("leaf-critical.pem", cert("critical.example", k(), by_int, extra=[(
    x509.UnrecognizedExtension(ObjectIdentifier("1.3.6.1.4.1.55555.1"), b"\x05\x00"), True)], **LEAF))
sub = cert("Example Sub CA", sub_key, by_int, ca=True)
save("sub-ca.pem", sub)
save("leaf-too-deep.pem", cert("deep.example", k(), (sub.subject, sub_key)))
rogue = cert("Rogue Root CA", rogue_key, ca=True, nb=D(2015), na=D(2045))
save("rogue-root.pem", rogue)
save("leaf-untrusted.pem", cert("untrusted.example", k(), (rogue.subject, rogue_key), **LEAF))
save("leaf-by-leaf.pem", cert("by-leaf.example", k(), (valid.subject, valid_key)))

save("issuing.crl.pem", crl(inter, int_key, [(revoked.serial_number, D(2028))]))
save("root.crl.pem", crl(root, root_key, []))
save("issuing-stale.crl.pem", crl(inter, int_key, [], this_update=D(2024), next_update=D(2025)))
save("issuing-forged.crl.pem", crl(inter, rogue_key, []))
