---
title: BUPT-SCSS-2021-Review
description: nova在这篇复习笔记中详细总结了北京邮电大学2021年网络空间安全导论的课程内容，并根据主要章节进行了一一阐述。笔记分为以下主要内容：
pubDate: 2021-12-31
tags:
- SCSS
- Study
- cheatsheet
authors:
- nova

---
# BUPT-SCSS-2021 Freshman Internet Security Introduction Review Notes

## 01 Introduction to Network Security - Basic Theories and Technical Framework

### Cyberspace

The **fifth space** following sea, land, air, and space.

A dynamic virtual space that includes various computing systems, networks, hardware and software, data, and information.

### Cyberspace Security

Research on the threats and defense measures faced by **information**, **networks**, and **systems** in the process of producing, transmitting, storing, and processing information.

### Key Characteristics of Information Security

#### _Confidentiality_

An inherent quality of information security.

Ensures that information cannot be accessed without authorization, and even if accessed without authorization, it cannot be used.

#### _Integrity_

Ensures the consistency of information.

Guarantees that information does not undergo unauthorized alterations, whether intentional or unintentional, during generation, transmission, storage, and processing.

#### _Availability_

Ensures the ability to provide services at any time.

Guarantees that information can be accessed by authorized users whenever needed.

#### Non-repudiation

Ensures the truthfulness of information.

Guarantees that information cannot be denied by users after it has been generated, issued, or received.

#### Controllability

Monitoring of information and information systems.

Control of information dissemination and content.

#### Auditability

Using auditing, monitoring, signatures, etc., to make users' actions verifiable.

Facilitates accountability after the fact.

### Main Contents of Cyberspace Security

#### Physical Security

Security of infrastructure.

Includes device security and electromagnetic security.

#### Operational Security

Security of information systems.

Includes system security and network security.

#### Data Security

Security of information itself.

Protection through encryption.

#### Content Security

Security of information utilization.

Content identification and big data privacy.

### Goals of Cyberspace Security

- **Cannot access** (access control mechanism)
- **Cannot take away** (authorization mechanism)
- **Cannot understand** (encryption mechanism)
- **Cannot alter** (data integrity mechanism)
- **Cannot escape** (audit, monitoring, signing mechanism)
- **Cannot break** (data backup and disaster recovery mechanism)

### APPDRR Dynamic Security Model

> PPDR, PDRR -> APPDRR

#### Assessment Risk Analysis

Understand the risk information faced by network security, and then take necessary measures.

#### Policy Security Strategy

_Principled guidance_.

Update policies based on risk assessment and security needs.

#### Protection System

Proactive security protection system.

Firewalls, access control, data encryption.

#### Detection Real-Time Monitoring

Network security event detection.

Intrusion detection, traffic analysis.

#### Reaction Real-Time Response

Prevention of malicious code and emergency response technology.

Defense against resource-consuming attacks such as DDoS and botnets.

#### Restoration Disaster Recovery

Enhance the survivability, resistance to destruction, and reliability of networks and information systems.

Remote data backup and quick recovery.

## 02 Introduction to Network Security - Cryptography V2

### Components of Cryptographic Systems

#### Plaintext

The original form of information.

#### Ciphertext

The result of encoding plaintext.

#### Encryption Algorithm

The process of encoding plaintext is called **encryption**, and the rules of encoding are called **encryption algorithms**.

#### Decryption Algorithm

The process of recovering plaintext from ciphertext is called **decryption**, and the rules of recovery are called **decryption algorithms**.

#### Key

Controls the mutual conversion between plaintext and ciphertext, divided into _encryption key_ and _decryption key_.

### Classification of Cryptographic Systems

#### Based on Data Processing Characteristics

- Block Ciphers: Encrypt data on a block-by-block basis.
- Stream Ciphers: Encrypt data bit by bit.

#### Based on Development Stage of Cryptography

- Traditional Ciphers (Classical Ciphers)
  - Substitution Ciphers: Shuffle the order of plaintext (e.g., rotor cipher).
  - Transposition Ciphers: Change the letters of plaintext (e.g., Caesar cipher).
- Modern Ciphers

#### Based on Cryptographic Characteristics

- Symmetric Ciphers
- Asymmetric Ciphers (Public Key Cryptography)

> Block ciphers and stream ciphers can be regarded as subclasses of symmetric encryption.

### Elements Required by Cryptographic Devices

Security, performance, ease of use, cost.

### Design Principles of Block Ciphers and Their Meanings

#### Confusion

Complex relationship between the key, ciphertext, and plaintext to thwart cryptanalysis.

#### Diffusion

Each bit of plaintext affects many bits of ciphertext to hide statistical properties of plaintext.

Each bit of the key affects many bits of ciphertext to prevent cracking the key bit by bit.

### Enigma Cipher Machine

#### Plugboard

Increased complexity of the key space.

#### Rotors

Increased algorithm complexity.

#### Reflector

Same encryption and decryption algorithm.

#### Daily Key

Key encrypts the key.

#### Session Key

Session-specific key.

#### Codebook

Central to the system.

Security depends on the key.

#### Five Elements

- **Plaintext**: Original text.
- **Ciphertext**: Encrypted text.
- **Encryption Algorithm**: Single-table substitution + multi-table substitution.
- **Decryption Algorithm**: Same as encryption algorithm.
- **Key**: Plugboard settings, rotor arrangement, rotor positions.

### DES Encryption Algorithm

Block cipher that divides plaintext into **64 bits**, uses a **56-bit key** to generate **48-bit subkeys**, encrypts each 64-bit plaintext block with subkeys to produce 64-bit ciphertext.

#### Subkey Generation Algorithm

Simple and fast to generate.

Each bit of the key has roughly the same influence on each bit of the subkey.

#### Round Function

- **Non-linearity**: Reflects algorithm complexity.
- **Reversibility**: Enables decryption.
- **Avalanche Effect**

### Requirements for Sequence Passwords' Password Sequence Generators

- Long seed key length
- Maximum period
- Randomness
- Irreversibility
- Avalanche effect
- Password sequence unpredictability (knowing the first half should not predict the second half)

### Symmetric Encryption

#### Advantages

Fast computation speed.

Relatively short key length.

No data expansion.

#### Disadvantages

Difficult key distribution.

Large number of keys to be kept secret, difficult to maintain.

Difficult to achieve digital signature and authentication functions.

### Public Key Cryptography

#### Significance

**Public key cryptography** is a hallmark of modern cryptography and is the largest and only true revolution in the history of cryptography.

#### Idea

Encryption key is the **public key**.

Decryption key is the **private key**.

#### Advantages

Easy key distribution.

Small amount of secret keys to be kept secret.

Ability to implement digital signature and authentication functions.

#### Disadvantages

Slow computational speed.

Long key length.

Data expansion.

> Regarding Hash and Authentication: Without a certificate, the identity of the party obtaining the public key cannot be confirmed.

### Diffie-Hellman Key Exchange

#### Scheme

Publicly agree on _p_ and _g_.

Alice and Bob each choose a number _a_ and _b_.

Compute `g^a mod p = Ka` and `g^b mod p = Kb` to exchange.

`Ka^b mod p = Kb^a mod p = K` is the key.

**Achievement**

Solved an _impossible problem_.

**Limitations**

Must be online simultaneously.

### RSA Public Key Cryptography

#### One-way Trapdoor Function

Given P and M, calculating C = P(M) is easy.

Given C but not S, calculating M is difficult.

Given C and S, calculating M is easy.

#### Algorithm

- Select two large prime numbers, _p_ and _q_.
- Calculate *n=p*q\*.
- Select _e_ such that gcd(e,φ(n))=1.
- d\*e ≡1 (mod φ(n)).

Keep _p_ and _q_ secret.

_e_ and _n_ are public keys.

_d_ is the private key.

Encryption Algorithm: C = E(M) ≡ M^e (mod n).

Decryption Algorithm: M = D(C) ≡ C^d (mod n).

#### Summary

- The _first practical public key algorithm_.
- The _most widely used_ public key encryption algorithm.
- RSA's theoretical basis is Euler's theorem in number theory.
- RSA's security relies on the difficulty of factoring large numbers.
- Neither **proof nor denial** of RSA's security by cryptanalysts.
- Can be used for _encryption_ and _digital signatures_.
- Currently, a _1024-bit key length_ is considered secure.

### Key Distribution Based on Public Key Cryptography

Unclear, possibly Ks(Ks(N1)) = D?

### Network Attacks

#### Attack Techniques

- **Attack**: _Any unauthorized_ action.
- **Network attack**: Unauthorized attackers infiltrating target systems through the _computer network_, including viewing, stealing, modifying, controlling, and damaging.

### DNS

Domain Name System, a distributed database that maps IP addresses to domain names and vice versa.

### DoS

#### Meaning

Denial of Service Attack.

A destructive attack method that **prevents** or **denies** legitimate users from accessing network services.

#### Principle

**Normal TCP three-way handshake**:

- ->SYN request
- <-SYN/ACK response
- ->ACK packet

**DoS Attack**:

- Sending a SYN with a fake IP source address.
- Server responds with SYN/ACK to the fake IP and waits for an ACK.
- No response, server retries and waits.

**DDoS**:

Using a botnet to distribute denial of service attacks.

- **Detection**: Scanning for vulnerable hosts.
- **Injection**: Planting a trojan on vulnerable hosts.
- **Control**: Choosing MasterServer, placing a guardian program.
- **Command**: Sending attack signal to other hosts.
- **Execution**: Other hosts begin attacking.
- **Outcome**: Target system flooded with fake requests, unable to respond to legitimate user requests.

### APT Attacks

#### Definition

Advanced Persistent Threat.

## Networking Defense (Firewalls)

### Firewall

#### Meaning

An advanced access control device placed between different network security domains to **control** (**allow**, **deny**, **record**) access to and from the network.

#### Functions

Based on time.

Based on traffic.

NAT functionality.

VPN functionality.

Logging and auditing.

#### Shortcomings

- **Transmission delays**, bottlenecks, and **single point of failure**.
- Cannot achieve some security functions:
  - Internal attacks
  - Connections not passing through the firewall
  - Attacks exploiting vulnerabilities in standard protocols
  - Data-driven attacks (buffer overflows)
  - Threats from misconfigured policies
  - Threats from the firewall's own security vulnerabilities

#### Trends

- Multi-functionality
- Performance optimization
- Distributed firewalls
- Strong auditing and automatic analysis
- Integration with other network security technologies

### Packet Filtering

Monitoring and filtering incoming and outgoing IP packets on the network based on IP addresses to allow communication with specified IPs.

### Network Address Translation (NAT)

#### Meaning

Network Address Translation.

One-to-one and many-to-one address conversion.

#### Benefits

- Mitigates IP address scarcity.
- Internal networks can use private IP addresses.
- Hides internal network structure, enhances security.

### Virtual Private Network (VPN)

#### Meaning

Establish a temporary, secure connection over a _public network_, providing the same level of security and functionality as a _private network_.

#### Benefits

- **Data integrity**: Ensures information transmitted via public networks cannot be tampered with.
- **Data confidentiality**: Information does not leak even if intercepted.
- **Identity authentication**: Validates user identity; limits access to unauthorized users; controls user access to resources.
- **Multi-protocol support** (transparency): Ability to embed common protocols of public networks.

### Intrusion Detection Systems (IDS)

#### Meaning

Records data, analyzes abnormal data, and discerns actual content through camouflage techniques.

### Intrusion Prevention Detection (IPS)

#### Meaning

Detects intrusion occurrences, halts intrusions through certain responses, making IDS and firewalls function as one unit.

### Vulnerability Scanning Systems

#### Meaning

Automatically detect weak points and vulnerabilities in remote or local hosts in terms of security.

### Vulnerabilities

#### Meaning

Security defects in hardware, software, or policies that allow attackers unauthorized access to and control over systems.

### Security Vulnerability

#### Meaning

Software upgrade or combined program developed to plug security holes.

### Security Holes

#### Meaning

A flaw in hardware, software, or policies that allows attackers to access and control systems without authorization.

### Security Audits

#### Meaning

The last line of defense.

Identification, recording, storage, and analysis of security-related information.

### Identity Authentication Technology in Information System Security

#### Content

**Software**

- **Security of the information system itself**
  - Identity authentication
    - **Role**: Ensures that resources are only used by authorized persons.
    - **Significance**: The first line of defense for information system security.
  - Access control
  - Security audit
  - Data backup
- Network security
- Operating system security

**Hardware**

- Hardware security
- Environmental security

### Zero-Knowledge Proof

Proving a statement is true without revealing any useful information to V.

> Alice tells Bob she has the key to the room but doesn't show the key.
>
> Instead, she shows an item that's only found inside the room, making Bob believe she has the key without actually seeing it.

### Password Authentication Based on Hash Functions

#### Benefits

- Passwords are not stored anywhere.
- Passwords are stored as hash values.
- Passwords are not known by the administrator.

#### Password Change

1. Encrypt the new password hash value using the original password's hash value as the key.
2. Decrypt the hash value of the original password in the database to obtain the hash value of the new password.
3. Replace the hash value.

### One-Way Authentication Based on Cryptographic Technology

#### One-Way Authentication based on Symmetric Cryptography

1. **Identification:** One-to-many communication.
2. **Verification:** One-to-one communication.

#### ~~Single-way Authentication Based on Certificates~~ (Not clear)

1. A generates Ks, rA, encrypts Ks using B's public key, signs rA, IDA, IDB, gives the encrypted Ks, A's certificate, and signature to B.
2. B verifies A's certificate to get A's public key, verifies the validity of S to authenticate A, decrypts the ciphertext to get Ks using the private key.
3. B selects rB, encrypts rB with Ks to send to A.

### Fingerprint Identification

#### Important Security Metrics

- False Acceptance Rate: Accepted when it shouldn't be.
- False Rejection Rate

#### Main Methods

- **Identification**: one-to-many.
- **Verification**: one-to-one.

### Access Control

#### Introduction

Techniques to enforce a defined security policy for system security, allowing or denying access requests to all resources by some method.

### Security Audit

#### Introduction

The last line of defense.

Identifying, recording, storing, and analyzing relevant information related to security.

:::info
This Content is generated by LLM and might be wrong / incomplete, refer to Chinese version if you find something wrong.
:::

{/* AI */}
