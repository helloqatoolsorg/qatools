from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives import serialization

# Generate private key
private_key = Ed25519PrivateKey.generate()

# Serialize private key
private_bytes = private_key.private_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PrivateFormat.PKCS8,
    encryption_algorithm=serialization.NoEncryption(),
)

# Serialize public key
public_key = private_key.public_key()
public_bytes = public_key.public_bytes(
    encoding=serialization.Encoding.PEM,
    format=serialization.PublicFormat.SubjectPublicKeyInfo,
)

# Write files
with open("private_key.pem", "wb") as f:
    f.write(private_bytes)

with open("public_key.pem", "wb") as f:
    f.write(public_bytes)

print("Keys generated:")
print("- private_key.pem")
print("- public_key.pem")
