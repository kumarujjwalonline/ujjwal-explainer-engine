"""Build the anatomy models for the 3D body walkthrough from BodyParts3D.

BodyParts3D, (c) The Database Center for Life Science (DBCLS), licensed CC BY 4.0.
Each group below is a list of FMA concepts; every mesh file (FJ*.obj) belonging to them is merged,
simplified to a face budget (GitHub renders WebGL in software, so geometry must stay light),
converted to metres with Y up and the feet at y=0, the body centred on x/z, and saved as
public/anatomy/<group>.glb. manifest.json records each group's centre and size for the camera.
usage: python scripts/build_anatomy.py OBJ_DIR LISTS_DIR OUT_DIR
"""
import json
import os
import sys

import numpy as np
import trimesh

obj_dir, lists_dir, out_dir = sys.argv[1:4]
os.makedirs(out_dir, exist_ok=True)

# group -> (list file, [FMA concept ids], face budget)
GROUPS = {
    "skin": ("partof", ["FMA7163"], 30000),
    "skeleton": ("partof", ["FMA23881"], 45000),
    "muscles": ("isa", ["FMA5022"], 45000),
    "brain": ("partof", ["FMA50801"], 8000),
    "nose": ("partof", ["FMA46472"], 2000),
    "airways": ("partof", ["FMA7393"], 6000),
    "lungs": ("partof", ["FMA7309", "FMA7310"], 12000),
    "heart": ("partof", ["FMA7088"], 9000),
    "liver": ("partof", ["FMA7197"], 6000),
    "gallbladder": ("partof", ["FMA7202"], 1000),
    "stomach": ("partof", ["FMA7148"], 4000),
    "esophagus": ("partof", ["FMA7131"], 1500),
    "pancreas": ("partof", ["FMA7198"], 2500),
    "intestines": ("partof", ["FMA7200", "FMA7201"], 14000),
    "kidneys": ("partof", ["FMA7204", "FMA7205"], 4000),
    "bladder": ("isa", ["FMA15900"], 1500),
    "diaphragm": ("partof", ["FMA13295"], 2500),
    "arteries": ("partof", ["FMA45623"], 18000),
    "veins": ("partof", ["FMA45626"], 12000),
}


def elements(kind):
    m = {}
    f = os.path.join(lists_dir, f"{kind}_element_parts.txt")
    for line in open(f, encoding="utf-8").read().splitlines()[1:]:
        p = line.split("\t")
        if len(p) >= 3:
            m.setdefault(p[0], set()).add(p[2].strip())
    return m


ELEM = {k: elements(k) for k in ("partof", "isa")}
FILES = {}
for root, _, names in os.walk(obj_dir):
    for n in names:
        if n.lower().endswith(".obj"):
            FILES.setdefault(n[:-4], os.path.join(root, n))
print("mesh files found:", len(FILES))


def load_group(kind, ids):
    want = set()
    for i in ids:
        want |= ELEM[kind].get(i, set())
    parts = []
    for fj in sorted(want):
        p = FILES.get(fj)
        if not p:
            continue
        m = trimesh.load(p, force="mesh", process=False)
        if isinstance(m, trimesh.Trimesh) and len(m.faces):
            parts.append(m)
    return want, parts


raw = {}
for g, (kind, ids, budget) in GROUPS.items():
    want, parts = load_group(kind, ids)
    if not parts:
        print(f"::warning::{g}: no meshes ({len(want)} elements listed)")
        continue
    raw[g] = (trimesh.util.concatenate(parts), budget)
    print(g, "elements", len(want), "loaded", len(parts), "faces", len(raw[g][0].faces))

# BodyParts3D: millimetres, Z up. Work out which way the face points from nose vs brain.
skin = raw["skin"][0]
lo, hi = skin.bounds
cx, cy = (lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2
front = 1.0
if "nose" in raw and "brain" in raw:
    front = 1.0 if raw["nose"][0].centroid[1] > raw["brain"][0].centroid[1] else -1.0
# new axes (metres): x' = x (flipped so the viewer sees the person's right on screen-left), y' = z - floor, z' = toward viewer
M = np.array([
    [-front, 0, 0],
    [0, 0, 1],
    [0, front, 0],
], dtype=float) * 0.001


def to_world(v):
    v = v - np.array([cx, cy, lo[2]])
    return v @ M.T


manifest = {"source": "BodyParts3D, (c) The Database Center for Life Science, CC BY 4.0", "groups": {}}
for g, (mesh, budget) in raw.items():
    mesh = mesh.copy()
    mesh.vertices = to_world(mesh.vertices)
    mesh.merge_vertices()
    if len(mesh.faces) > budget:
        try:
            mesh = mesh.simplify_quadric_decimation(face_count=budget)
        except TypeError:
            mesh = mesh.simplify_quadric_decimation(1 - budget / len(mesh.faces))
    mesh.remove_unreferenced_vertices()
    mesh.fix_normals()
    mesh.vertices = np.round(mesh.vertices, 4)
    path = os.path.join(out_dir, f"{g}.glb")
    mesh.export(path)
    b = mesh.bounds
    manifest["groups"][g] = {
        "center": [round(float(x), 4) for x in mesh.centroid],
        "size": [round(float(x), 4) for x in (b[1] - b[0])],
        "faces": int(len(mesh.faces)),
        "kb": round(os.path.getsize(path) / 1024),
    }
    print(g, manifest["groups"][g])
json.dump(manifest, open(os.path.join(out_dir, "manifest.json"), "w"), indent=1)
open(os.path.join(out_dir, "LICENSE.txt"), "w").write(
    "Anatomy models derived from BodyParts3D, (c) The Database Center for Life Science (DBCLS),\n"
    "licensed under Creative Commons Attribution 4.0 International (CC BY 4.0).\n"
    "Changes: merged into organ groups, simplified, rescaled to metres, re-oriented.\n")
