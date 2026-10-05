"""Identity export used by the future Prepare qatools tool shelf action.

This exports the saved definition. It does not inject or certify licensing.
"""
import hashlib
import json
from pathlib import Path
import re
import tempfile
import zipfile


def identity(label, internal_name, filename, content):
    if (not isinstance(label, str) or len(label) > 80
            or not re.fullmatch(r"[A-Za-z][A-Za-z0-9]*(?: [A-Za-z0-9]+)*", label)):
        raise ValueError("Asset Label is invalid: " + repr(label) +
                         ". Use letters/numbers and single spaces, starting with a letter, up to 80 characters. "
                         "For example: Beautiful Noise. Remove leading/trailing or repeated spaces.")
    expected = label.replace(" ", "_")
    if internal_name != expected:
        raise ValueError("Asset Label: " + repr(label) + "\n"
                         "Actual Houdini type name: " + repr(internal_name) + "\n"
                         "Expected Internal Name: " + repr(expected) + "\n"
                         "Capitalization must match the Asset Label; replace each space with an underscore. "
                         "This helper currently rejects namespace prefixes and version suffixes (names containing ::).")
    slug = internal_name.lower()
    if filename not in [slug + ext for ext in (".hda", ".hdalc", ".hdanc")]:
        raise ValueError("The HDA filename must match its stable slug.")
    if not 24 < len(content) <= 4 * 1024 * 1024 or content[:4] != b"INDX":
        raise ValueError("Choose a valid HDA smaller than 4 MB.")
    return {"schema": 1, "label": label, "internal_name": internal_name,
            "slug": slug, "file": filename, "sha256": hashlib.sha256(content).hexdigest()}


def export_definition(definition, destination):
    """Copy one saved definition to a new ZIP, without changing its source HDA.

    Never overwrites an existing export. Call after the licensing preparation
    and validation step; exporting identity alone does not license an asset.
    """
    label, internal_name = definition.description(), definition.nodeTypeName()
    # Validate naming before writing any files.
    slug = internal_name.lower()
    source = Path(definition.libraryFilePath())
    extension = source.suffix.lower()
    if extension not in (".hda", ".hdalc", ".hdanc"):
        raise ValueError("Save the asset to an HDA library before exporting.")
    filename = slug + extension
    identity(label, internal_name, filename, b"INDX" + b"x" * 25)
    target = Path(destination)
    if target.suffix.lower() != ".zip":
        raise ValueError("Choose a ZIP export path.")
    with tempfile.TemporaryDirectory(prefix="qatools-export-") as temporary:
        copied = Path(temporary) / filename
        definition.copyToHDAFile(str(copied))
        content = copied.read_bytes()
        metadata = identity(label, internal_name, filename, content)
        # Exclusive creation also prevents accidental replacement during races.
        with target.open("xb") as output:
            try:
                with zipfile.ZipFile(output, "w", zipfile.ZIP_STORED) as archive:
                    archive.writestr("qatools-tool.json", json.dumps(metadata, ensure_ascii=True))
                    archive.writestr(filename, content)
            except Exception:
                output.close()
                target.unlink(missing_ok=True)
                raise
    return metadata
