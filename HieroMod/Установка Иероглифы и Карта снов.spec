# -*- mode: python ; coding: utf-8 -*-
# Единый установщик: мод «Египетские иероглифы» + программа «Карта снов»

a = Analysis(
    ['Установка.pyw'],
    pathex=[],
    binaries=[],
    datas=[('dist\\Писец.exe', '.'), ('assets', 'assets'), ('dreammap', 'dreammap'),
           ('mods_pack', 'mods_pack')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='Установка Иероглифы и Карта снов',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
