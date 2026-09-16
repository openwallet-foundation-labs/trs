"""Regenerates the test certificates (python3 + `cryptography`). Keys are throwaway."""
import datetime as dt
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID

D = lambda y, m=1, d=1: dt.datetime(y, m, d, tzinfo=dt.timezone.utc)


def name(cn):
    return x509.Name([
        x509.NameAttribute(NameOID.COUNTRY_NAME, "ZZ"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Example QTSP"),
        x509.NameAttribute(NameOID.COMMON_NAME, cn),
    ])


def cert(cn, key, not_before, not_after, issuer=None, ca=False):
    issuer_name, issuer_key = (issuer or (name(cn), key))
    b = (x509.CertificateBuilder()
         .subject_name(name(cn)).issuer_name(issuer_name)
         .public_key(key.public_key())
         .serial_number(x509.random_serial_number())
         .not_valid_before(not_before).not_valid_after(not_after)
         .add_extension(x509.BasicConstraints(ca=ca, path_length=None), critical=True)
         .add_extension(x509.SubjectKeyIdentifier.from_public_key(key.public_key()), critical=False))
    return b.sign(issuer_key, hashes.SHA256())


def save(fn, c):
    open(fn, "wb").write(c.public_bytes(serialization.Encoding.PEM))


k = lambda: ec.generate_private_key(ec.SECP256R1())
ca_key, old_key, tsa_key, rogue_key = k(), k(), k(), k()

ca = cert("Example QC CA G1", ca_key, D(2015), D(2045), ca=True)
save("ca-qc-granted.pem", ca)
save("ca-qc-withdrawn.pem", cert("Example QC CA G0", old_key, D(2010), D(2040), ca=True))
save("tsa-qtst.pem", cert("Example QTST", tsa_key, D(2015), D(2045)))
save("leaf-issued.pem", cert("Alice Example", k(), D(2020), D(2040), issuer=(ca.subject, ca_key)))
save("leaf-expired.pem", cert("Bob Example", k(), D(2016), D(2017), issuer=(ca.subject, ca_key)))
# Same issuer *name* as the listed CA, but signed by a different key: must never match.
save("leaf-forged.pem", cert("Mallory Example", k(), D(2020), D(2040), issuer=(ca.subject, rogue_key)))
save("unlisted-ca.pem", cert("Unlisted CA", rogue_key, D(2015), D(2045), ca=True))
