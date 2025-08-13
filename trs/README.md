# OpenID Federation Trust Infrastructure

## Project Overview

A trust infrastructure system implemented based on the OpenID Federation standard. It consists of two core components:

1. **hTrust** - Trust Registry Service (Issuer role)
2. **TRS** - Trust Resolution Service (Verifier role)

## System Architecture

```
┌─────────────────────────────────────────────────┐
│                 Trust Anchor                     │
│         (https://trust-anchor.example.org)       │
└────────────────────┬─────────────────────────────┘
                     │ authority_hints
                     ▼
┌─────────────────────────────────────────────────┐
│                   hTrust                         │
│            (http://localhost:3000)               │
│                                                  │
│  - Issues Entity Configuration (EC)              │
│  - Issues Entity Statement (ES)                  │
│  - Provides Federation Fetch Endpoint            │
└─────────────────────────────────────────────────┘
                     │
                     │ OpenID Federation
                     │ Protocol
                     ▼
┌─────────────────────────────────────────────────┐
│                    TRS                           │
│            (http://localhost:8080)               │
│                                                  │
│  - Verifies EC/ES                                │
│  - Validates Trust Chain                         │
│  - Provides TRQP API                             │
│  - Policy-based YES/NO decisions                 │
└─────────────────────────────────────────────────┘
```

## 1. hTrust (Trust Registry Service)

### Role

- Acts as an **Issuer**
- Issues its own Entity Configuration (EC) where iss=sub=TRS
- Issues Entity Statements (ES) for subordinate entities (iss=TRS, sub=subordinate entity)
- Maintains the freshness and accuracy of issued ES

### Main Endpoints

#### `GET /.well-known/openid-federation`

Returns Entity Configuration in JWT format

**Example Response (decoded payload):**

```json
{
  "iss": "https://trs.example.org",
  "sub": "https://trs.example.org",
  "exp": 1755166241,
  "iat": 1755079841,
  "jwks": {
    "keys": [
      {
        "kty": "EC",
        "use": "sig",
        "crv": "P-256",
        "kid": "trs-test-key-1",
        "x": "68aOQ08Lq8Hxl559hlAFVkGV_4TNCbxNqQoN9EIC4yw",
        "y": "HUWghA91oVeMO7DTsNb_DXQlZwO27KnbjvFlLQZJFMI",
        "alg": "ES256"
      }
    ]
  },
  "authority_hints": ["https://trust-anchor.example.org"],
  "metadata": {
    "federation_entity": {
      "organization_name": "Test Trust Registry Service",
      "contacts": ["admin@trs.example.org"],
      "homepage_uri": "https://trs.example.org",
      "federation_fetch_endpoint": "https://trs.example.org/fetch"
    }
  }
}
```

### How to Run

```bash
npm install
npm run start:dev  # Runs on port 3000
```

## 2. TRS (Trust Resolution Service)

### Role

- Acts as a **Verifier/Resolver**
- Receives client requests and verifies trustworthiness
- Fetches and validates EC from hTrust
- Traces trust chain to Trust Anchor
- Applies policy logic to return YES/NO decisions

### Key Features

#### 1. Entity Configuration (EC) Validation

- Fetches JWT from `.well-known/openid-federation` endpoint
- Verifies JWT signature and type (`entity-statement+jwt`)
- Validates required claims (iss, sub, iat, exp)
- Verifies self-issued property (iss === sub)

#### 2. Entity Statement (ES) Validation

- Fetches ES through federation fetch endpoint
- Validates issuer and subject (iss === authority_id, sub === entity_id)
- Verifies expiration time

#### 3. Trust Chain Validation

- Follows authority hints to Trust Anchor
- Prevents circular references
- Confirms Trust Anchor reached

### API Endpoints

#### `POST /resolver/recognition`

Checks entity recognition status (TRQP standard)

**Request:**

```json
{
  "authority_id": "http://localhost:3000",
  "entity_id": "http://localhost:3000",
  "scope": "financial-services",
  "time": "2025-08-13T10:00:00Z"
}
```

**Response:**

```json
{
  "recognized": true,
  "metadata": {
    "timestamp": "2025-08-13T10:12:26.066Z"
  }
}
```

#### `POST /resolver/authorization`

Checks entity authorization status (TRQP standard)

**Request:**

```json
{
  "authority_id": "http://localhost:3000",
  "entity_id": "http://localhost:3000",
  "assertion_id": "credential_issuer",
  "scope": "financial-services",
  "time": "2025-08-13T10:00:00Z"
}
```

**Response:**

```json
{
  "authorized": false,
  "metadata": {
    "timestamp": "2025-08-13T10:06:45.970Z"
  }
}
```

#### `GET /resolver/health`

Service health check

**Response:**

```json
{
  "status": "healthy",
  "timestamp": "2025-08-13T10:06:08.175Z",
  "version": "1.0.0"
}
```

### Project Structure

```
trs/
├── src/
│   ├── main.ts                    # App entry point (port 8080)
│   ├── app.module.ts              # Root module
│   ├── resolver/
│   │   ├── resolver.module.ts    # Resolver module
│   │   ├── resolver.controller.ts # TRQP API controller
│   │   ├── dto/
│   │   │   ├── recognition.dto.ts # Recognition request/response DTOs
│   │   │   ├── authorization.dto.ts # Authorization request/response DTOs
│   │   │   └── resolution.dto.ts  # Resolution common types
│   │   └── services/
│   │       └── trs.service.ts    # Core TRS business logic
│   └── registry/
│       └── registry.module.ts    # Registry module
├── package.json
└── tsconfig.json
```

### How to Run

```bash
npm install
npm run start:dev  # Runs on port 8080
```

### Swagger Documentation

API documentation available at http://localhost:8080/api

## 3. Integration Testing

### Running the Complete System

```bash
# Terminal 1: Run hTrust
cd /Users/seorimyun/Documents/back/hTrust
npm run start:dev  # Port 3000

# Terminal 2: Run TRS
cd /Users/seorimyun/Documents/back/trs/trs
npm run start:dev  # Port 8080
```

### Test Scenarios

#### 1. Recognition Test

```bash
curl -X POST http://localhost:8080/resolver/recognition \
  -H "Content-Type: application/json" \
  -d '{
    "authority_id": "http://localhost:3000",
    "entity_id": "http://localhost:3000",
    "scope": "financial-services",
    "time": "2025-08-13T10:00:00Z"
  }'
```

**Validation Process:**

1. TRS calls `http://localhost:3000/.well-known/openid-federation`
2. Decodes and verifies JWT
3. EC validation: confirms iss=sub ✅
4. Trust Chain validation: localhost:3000 set as Trust Anchor ✅
5. Result: `recognized: true`

#### 2. Authorization Test

```bash
curl -X POST http://localhost:8080/resolver/authorization \
  -H "Content-Type: application/json" \
  -d '{
    "authority_id": "http://localhost:3000",
    "entity_id": "http://localhost:3000",
    "assertion_id": "credential_issuer",
    "scope": "financial-services",
    "time": "2025-08-13T10:00:00Z"
  }'
```

## 4. Standards Compliance

### OpenID Federation Standard

- ✅ `.well-known/openid-federation` endpoint
- ✅ JWT format (`entity-statement+jwt` type)
- ✅ Required claims (iss, sub, iat, exp, jwks)
- ✅ Trust Chain via authority hints
- ✅ Federation fetch endpoint (for ES retrieval)

### TRQP (Trust Registry Query Protocol) Standard

- ✅ Recognition API
- ✅ Authorization API
- ✅ Standard request/response format
- ✅ Required fields: authority_id, entity_id
- ✅ Optional fields: scope, time

## 5. Current Implementation Status

### Completed Features

- ✅ hTrust EC issuance
- ✅ TRS EC validation
- ✅ Trust Chain validation
- ✅ TRQP Recognition API
- ✅ TRQP Authorization API
- ✅ JWT decoding and basic validation
- ✅ Swagger API documentation

### Features to be Implemented

- ⚠️ JWT signature verification (using JWKS)
- ⚠️ Complete federation fetch endpoint implementation
- ⚠️ Entity Statement issuance and validation
- ⚠️ Trust Mark processing
- ⚠️ Dynamic Trust Anchor discovery
- ⚠️ Caching and performance optimization

## 6. Security Considerations

- HTTPS recommended (current development uses HTTP)
- JWT signature verification required
- Trust Anchor whitelist management
- Expiration time validation
- Circular reference prevention

## 7. Development Environment

- Node.js v23.4.0
- NestJS Framework
- TypeScript
- JWT library: jsonwebtoken
- HTTP client: @nestjs/axios
- API documentation: @nestjs/swagger

## 8. References

- [OpenID Federation 1.0 Specification](https://openid.net/specs/openid-federation-1_0.html)
- [Trust Registry Query Protocol (TRQP)](https://github.com/trustoverip/tswg-trqp-specification)
- [NestJS Documentation](https://docs.nestjs.com)
