"""Development configuration. Contains a PUBLIC verification key only.
Use a fresh production signer and pin its public key before distributing tools.
"""
SERVER_URL = "https://www.qatools.org"
ALLOW_LOCALHOST_HTTP = False
PUBLIC_KEYS = {"dev-39057427c448": "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAvHZlLBHZa6mvs2wJPx9ZEMvHR4OiJygzagwXCXMSmG4=\n-----END PUBLIC KEY-----\n"}
