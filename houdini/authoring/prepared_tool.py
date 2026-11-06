"""Identity export used by the future Prepare QATools tool shelf action.

This exports the saved definition. It does not inject or certify licensing.
"""
import hashlib
import json
from pathlib import Path
import re
import tempfile
import zipfile
import os
from contextlib import contextmanager


def canonical_export_folder(value):
    """Keep custom locations; canonicalize only the shared release folder name."""
    folder = Path(value)
    return folder.with_name("QATools") if folder.name.casefold() == "qatools" else folder


@contextmanager
def atomic_export(target):
    """Publish a completed ZIP atomically; a failed export retains the old file."""
    target = Path(target)
    target.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix="." + target.stem + "-", suffix=".tmp", dir=target.parent)
    try:
        with os.fdopen(descriptor, "wb") as output:
            yield output
            output.flush()
            os.fsync(output.fileno())
        os.replace(temporary, target)
    finally:
        Path(temporary).unlink(missing_ok=True)


def release_names(source_internal):
    if not isinstance(source_internal, str) or not re.fullmatch(r"[A-Za-z]+(?:_[A-Za-z]+)*_dev", source_internal):
        raise ValueError("Use a development Internal Name such as QA_Tool_A_dev (letters, underscores, and one final _dev).")
    internal = source_internal[:-4]
    if internal.endswith("_dev"):
        raise ValueError("Use only one final _dev suffix in the development Internal Name.")
    return internal.replace("_", " "), internal


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
    if filename not in [stem + ext for stem in (slug, internal_name) for ext in (".hda", ".hdalc", ".hdanc")]:
        raise ValueError("The HDA filename must match its stable slug.")
    if not 24 < len(content) <= 4 * 1024 * 1024 or content[:4] != b"INDX":
        raise ValueError("Choose a valid HDA smaller than 4 MB.")
    return {"schema": 1, "label": label, "internal_name": internal_name,
            "slug": slug, "file": filename, "sha256": hashlib.sha256(content).hexdigest()}


def export_definition(definition, destination, template_node=None, staging_parent=None):
    """Copy one saved definition to a new ZIP, without changing its source HDA.

    Replaces an existing ZIP only after successful completion. Call after the licensing preparation
    and validation step; exporting identity alone does not license an asset.
    """
    label, internal_name = definition.description(), definition.nodeTypeName()
    # Validate naming before writing any files.
    slug = internal_name.lower()
    source = Path(definition.libraryFilePath())
    extension = source.suffix.lower()
    if extension not in (".hda", ".hdalc", ".hdanc"):
        raise ValueError("Save the asset to an HDA library before exporting.")
    filename = internal_name + extension
    identity(label, internal_name, filename, b"INDX" + b"x" * 25)
    target = Path(destination).parent / (internal_name + ".zip")
    if target.suffix.lower() != ".zip":
        raise ValueError("Choose a ZIP export path.")
    with tempfile.TemporaryDirectory(prefix="qatools-export-", dir=staging_parent) as temporary:
        copied = Path(temporary) / filename
        if template_node is None:
            definition.copyToHDAFile(str(copied))
        else:
            # This must be the last HDA write. Package these exact saved bytes.
            definition.save(str(copied), template_node=template_node,
                            black_box=True, create_backup=False)
        content = copied.read_bytes()
        metadata = identity(label, internal_name, filename, content)
        with atomic_export(target) as output:
            with zipfile.ZipFile(output, "w", zipfile.ZIP_STORED) as archive:
                archive.writestr("qatools-tool.json", json.dumps(metadata, ensure_ascii=True))
                archive.writestr(filename, content)
    return metadata
