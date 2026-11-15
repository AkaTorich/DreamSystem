"""Чистый Python-декодер LZ4: блочный формат и frame-формат.

Нужен для архивов BSA версии 105 (Skyrim Special Edition) и для тел
сейвов .ess, сжатых кодеком LZ4. Внешних зависимостей нет.
"""

import struct

FRAME_MAGIC = 0x184D2204
SKIPPABLE_LO = 0x184D2A50
SKIPPABLE_HI = 0x184D2A5F


def decode_block(src, dst=None, start=0):
    """Разжать один LZ4-блок, дописывая результат в dst.

    dst передаётся между блоками, чтобы работали связанные блоки
    (block-linked mode), где match может ссылаться на предыдущий блок.
    """
    if dst is None:
        dst = bytearray()
    i = start
    n = len(src)
    while i < n:
        token = src[i]
        i += 1

        lit = token >> 4
        if lit == 15:
            while True:
                b = src[i]
                i += 1
                lit += b
                if b != 255:
                    break
        if lit:
            dst += src[i:i + lit]
            i += lit

        if i >= n:
            break

        offset = src[i] | (src[i + 1] << 8)
        i += 2
        if offset == 0:
            raise ValueError('LZ4: нулевое смещение match')

        mlen = token & 15
        if mlen == 15:
            while True:
                b = src[i]
                i += 1
                mlen += b
                if b != 255:
                    break
        mlen += 4

        pos = len(dst) - offset
        if pos < 0:
            raise ValueError('LZ4: match за пределами буфера')
        if offset >= mlen:
            dst += dst[pos:pos + mlen]
        else:
            for j in range(mlen):
                dst.append(dst[pos + j])
    return dst


def decode_frame(data, offset=0):
    """Разжать LZ4 frame (магия 0x184D2204). Контрольные суммы не проверяются."""
    magic = struct.unpack_from('<I', data, offset)[0]
    if SKIPPABLE_LO <= magic <= SKIPPABLE_HI:
        size = struct.unpack_from('<I', data, offset + 4)[0]
        return decode_frame(data, offset + 8 + size)
    if magic != FRAME_MAGIC:
        raise ValueError('LZ4: не frame-формат (0x%08X)' % magic)

    p = offset + 4
    flg = data[p]
    p += 2  # flg + bd
    if (flg >> 6) != 1:
        raise ValueError('LZ4: неподдерживаемая версия frame')
    block_checksum = bool(flg & 0x10)
    content_size = bool(flg & 0x08)
    content_checksum = bool(flg & 0x04)
    dict_id = bool(flg & 0x01)
    if content_size:
        p += 8
    if dict_id:
        p += 4
    p += 1  # header checksum

    out = bytearray()
    while True:
        block_size = struct.unpack_from('<I', data, p)[0]
        p += 4
        if block_size == 0:
            break
        raw = bool(block_size & 0x80000000)
        block_size &= 0x7FFFFFFF
        chunk = data[p:p + block_size]
        p += block_size
        if raw:
            out += chunk
        else:
            decode_block(chunk, out)
        if block_checksum:
            p += 4
    if content_checksum:
        p += 4
    return bytes(out)


def decompress(data, expected=None):
    """Универсальная точка входа: frame, если есть магия, иначе голый блок."""
    if len(data) >= 4 and struct.unpack_from('<I', data, 0)[0] == FRAME_MAGIC:
        return decode_frame(data)
    return bytes(decode_block(data))
