// Far above what a media fragment holds (a few hundred samples).
const MAX_TRUN_SAMPLES = 100000;

export function parseBoxes(u8, start, end) {
  const boxes = [];
  let i = start;
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  while (i < end) {
    if (i + 8 > end) {
      boxes.push({
        type: '',
        start: i,
        headerSize: 0,
        size: 0,
        end,
        truncated: true
      });
      break;
    }
    let size = view.getUint32(i);
    let type = String.fromCharCode(u8[i + 4], u8[i + 5], u8[i + 6], u8[i + 7]);
    let headerSize = 8;
    if (size === 1) {
      if (i + 16 > end) {
        boxes.push({
          type,
          start: i,
          headerSize: 16,
          size: 1,
          end,
          truncated: true
        });
        break;
      }
      const hi = view.getUint32(i + 8);
      const lo = view.getUint32(i + 12);
      if (hi > 0x1fffff) throw new Error('Size exceeds MAX_SAFE_INTEGER');
      size = hi * 0x100000000 + lo;
      headerSize = 16;
    } else if (size === 0) {
      size = end - i;
    }

    if (i + size > end || size < headerSize) {
      boxes.push({ type, start: i, headerSize, size, end, truncated: true });
      break;
    }

    boxes.push({
      type,
      start: i,
      headerSize,
      size,
      end: i + size,
      truncated: false
    });
    i += size;
  }
  return boxes;
}

export function classifyMp4(u8) {
  const boxes = parseBoxes(u8, 0, u8.length);
  const types = new Set(boxes.map((b) => b.type));
  if (types.has('moov') && types.has('moof')) return 'init+media';
  if (types.has('moov')) return 'init';
  if (types.has('moof')) return 'media';
  return 'unknown';
}

function dfs(u8, start, end, target) {
  const boxes = parseBoxes(u8, start, end);
  for (const box of boxes) {
    if (box.type === target) return box;
    if (
      ['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex', 'moof', 'traf'].includes(
        box.type
      )
    ) {
      if (!box.truncated) {
        const res = dfs(u8, box.start + box.headerSize, box.end, target);
        if (res) return res;
      }
    }
  }
  return null;
}

export function findMdhdTimescale(u8) {
  const mdhd = dfs(u8, 0, u8.length, 'mdhd');
  if (!mdhd || mdhd.truncated) return null;
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const version = view.getUint8(mdhd.start + mdhd.headerSize);
  let offset = mdhd.start + mdhd.headerSize + 4;
  if (version === 1) {
    offset += 16;
  } else {
    offset += 8;
  }
  const timescale = view.getUint32(offset);
  return { offset, version, timescale };
}

export function rewriteInitTimescale(u8, speed) {
  const ts = findMdhdTimescale(u8);
  if (!ts) throw new RangeError('mdhd not found');
  const scaled = Math.round(ts.timescale * speed);
  const data = new Uint8Array(u8);
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  view.setUint32(ts.offset, scaled);
  return {
    data,
    original: ts.timescale,
    scaled,
    relativeError:
      Math.abs(scaled - ts.timescale * speed) / (ts.timescale * speed)
  };
}

function readDescr(view, start, end) {
  let p = start;
  if (p >= end) return null;
  const tag = view.getUint8(p++);
  let len = 0;
  let b;
  do {
    if (p >= end) return null;
    b = view.getUint8(p++);
    len = (len << 7) | (b & 0x7f);
  } while (b & 0x80);
  return { tag, len, start: p, end: p + len };
}

function opusHeadFromDOps(d) {
  const src = new DataView(d.buffer, d.byteOffset, d.byteLength);
  const out = new Uint8Array(19 + Math.max(0, d.length - 11));
  const dst = new DataView(out.buffer);
  out.set([79, 112, 117, 115, 72, 101, 97, 100], 0); // "OpusHead"
  out[8] = 1;
  out[9] = d[1];
  dst.setUint16(10, src.getUint16(2), true);
  dst.setUint32(12, src.getUint32(4), true);
  dst.setInt16(16, src.getInt16(8), true);
  out[18] = d[10];
  // Channel mapping table (family != 0) has the same layout in both formats.
  out.set(d.subarray(11), 19);
  return out;
}

export function parseInitInfo(u8) {
  const ts = findMdhdTimescale(u8);
  if (!ts) return null;
  const trexBox = dfs(u8, 0, u8.length, 'trex');
  let trex;
  if (trexBox && !trexBox.truncated) {
    const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const p = trexBox.start + trexBox.headerSize + 4; // FullBox header
    trex = {
      defaultDuration: view.getUint32(p + 8),
      defaultSize: view.getUint32(p + 12),
      defaultFlags: view.getUint32(p + 16)
    };
  }
  return { timescale: ts.timescale, trex };
}

export function audioConfigFromInit(u8) {
  const stsd = dfs(u8, 0, u8.length, 'stsd');
  if (!stsd || stsd.truncated) return { unsupported: true };

  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  let offset = stsd.start + stsd.headerSize + 8;
  const entries = parseBoxes(u8, offset, stsd.end);

  for (const entry of entries) {
    if (entry.type === 'mp4a') {
      const channelCount = view.getUint16(entry.start + entry.headerSize + 16);
      const sampleRate =
        view.getUint32(entry.start + entry.headerSize + 24) >>> 16;
      const esds = dfs(
        u8,
        entry.start + entry.headerSize + 28,
        entry.end,
        'esds'
      );
      if (esds) {
        let p = esds.start + esds.headerSize + 4; // skip FullBox
        let esDescr = readDescr(view, p, esds.end);
        if (esDescr && esDescr.tag === 0x03) {
          let decConfStart = esDescr.start + 3;
          let decConf = readDescr(view, decConfStart, esDescr.end);
          if (decConf && decConf.tag === 0x04) {
            let decSpecStart = decConf.start + 13;
            let decSpec = readDescr(view, decSpecStart, decConf.end);
            if (decSpec && decSpec.tag === 0x05) {
              const description = new Uint8Array(
                u8.buffer,
                u8.byteOffset + decSpec.start,
                decSpec.len
              );
              // The codec string must carry the real Audio Object Type (2 = LC, 5 = HE-AAC, ...).
              const aot = description.length ? description[0] >> 3 : 2;
              return {
                codec: `mp4a.40.${aot}`,
                sampleRate,
                numberOfChannels: channelCount,
                description
              };
            }
          }
        }
      }
    } else if (entry.type === 'Opus') {
      const channelCount = view.getUint16(entry.start + entry.headerSize + 16);
      const dOps = dfs(
        u8,
        entry.start + entry.headerSize + 28,
        entry.end,
        'dOps'
      );
      if (dOps) {
        return {
          codec: 'opus',
          sampleRate: 48000,
          numberOfChannels: channelCount,
          description: opusHeadFromDOps(
            u8.subarray(dOps.start + dOps.headerSize, dOps.end)
          )
        };
      }
    } else if (
      entry.type === 'avc1' ||
      entry.type === 'av01' ||
      entry.type === 'vp09'
    ) {
      return { unsupported: true, codec: entry.type };
    }
  }
  return { unsupported: true };
}

export function demuxFragments(u8, { timescale, trex }) {
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  const samples = [];
  const boxes = parseBoxes(u8, 0, u8.length);

  let restStart = u8.length;

  const defaultDuration = trex ? trex.defaultDuration : 0;
  const defaultSize = trex ? trex.defaultSize : 0;
  const defaultFlags = trex ? trex.defaultFlags : 0;

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    // A chunk may end anywhere, even inside an 8-byte box header: whatever is
    // incomplete must be handed back so the caller can prepend it to the next chunk.
    if (box.truncated && box.type !== 'moof') {
      restStart = Math.min(restStart, box.start);
      continue;
    }
    if (box.type === 'moof') {
      if (box.truncated) {
        restStart = Math.min(restStart, box.start);
        continue;
      }
      const trafBoxes = parseBoxes(
        u8,
        box.start + box.headerSize,
        box.end
      ).filter((b) => b.type === 'traf');

      let moofValid = true;
      let moofSamples = [];

      for (const traf of trafBoxes) {
        const trBoxes = parseBoxes(u8, traf.start + traf.headerSize, traf.end);
        const tfhd = trBoxes.find((b) => b.type === 'tfhd');
        const tfdt = trBoxes.find((b) => b.type === 'tfdt');
        const trunList = trBoxes.filter((b) => b.type === 'trun');

        let baseDataOffset = box.start;
        let trafDefaultDuration = defaultDuration;
        let trafDefaultSize = defaultSize;
        let trafDefaultFlags = defaultFlags;

        if (tfhd) {
          const flags = view.getUint32(tfhd.start + tfhd.headerSize) & 0xffffff;
          // FullBox header (4) + track_ID (4): the optional fields start after both.
          let p = tfhd.start + tfhd.headerSize + 8;
          if (flags & 0x01) {
            const hi = view.getUint32(p);
            const lo = view.getUint32(p + 4);
            baseDataOffset = hi * 0x100000000 + lo;
            p += 8;
          } else if (flags & 0x20000) {
            baseDataOffset = box.start;
          }
          if (flags & 0x02) p += 4;
          if (flags & 0x08) {
            trafDefaultDuration = view.getUint32(p);
            p += 4;
          }
          if (flags & 0x10) {
            trafDefaultSize = view.getUint32(p);
            p += 4;
          }
          if (flags & 0x20) {
            trafDefaultFlags = view.getUint32(p);
          }
        }

        let currentDecodeTime = 0;
        if (tfdt) {
          const version = view.getUint8(tfdt.start + tfdt.headerSize);
          if (version === 1) {
            const hi = view.getUint32(tfdt.start + tfdt.headerSize + 4);
            const lo = view.getUint32(tfdt.start + tfdt.headerSize + 8);
            currentDecodeTime = hi * 0x100000000 + lo;
          } else {
            currentDecodeTime = view.getUint32(
              tfdt.start + tfdt.headerSize + 4
            );
          }
        }

        for (const trun of trunList) {
          const version = view.getUint8(trun.start + trun.headerSize);
          const flags = view.getUint32(trun.start + trun.headerSize) & 0xffffff;
          let p = trun.start + trun.headerSize + 4;

          const sampleCount = view.getUint32(p);
          p += 4;
          let dataOffset = 0;
          if (flags & 0x01) {
            dataOffset = view.getInt32(p);
            p += 4;
          }
          let firstSampleFlags = 0;
          if (flags & 0x04) {
            firstSampleFlags = view.getUint32(p);
            p += 4;
          }

          let trunDataOffset = baseDataOffset + dataOffset;

          // A malformed count must not make us loop over billions of samples:
          // the per-sample fields have to fit in the box, and the count is
          // capped for samples without per-sample fields.
          const bytesPerSample =
            4 *
            (((flags >> 8) & 1) +
              ((flags >> 9) & 1) +
              ((flags >> 10) & 1) +
              ((flags >> 11) & 1));
          if (
            sampleCount > MAX_TRUN_SAMPLES ||
            p + sampleCount * bytesPerSample > trun.end
          ) {
            moofValid = false;
            break;
          }

          for (let s = 0; s < sampleCount; s++) {
            let duration = trafDefaultDuration;
            let size = trafDefaultSize;
            let sampleFlags =
              s === 0 && flags & 0x04 ? firstSampleFlags : trafDefaultFlags;
            let cto = 0;

            if (flags & 0x100) {
              duration = view.getUint32(p);
              p += 4;
            }
            if (flags & 0x200) {
              size = view.getUint32(p);
              p += 4;
            }
            if (flags & 0x400) {
              sampleFlags = view.getUint32(p);
              p += 4;
            }
            if (flags & 0x800) {
              cto = version === 1 ? view.getInt32(p) : view.getUint32(p);
              p += 4;
            }

            const isNonSync = (sampleFlags >> 16) & 1;
            const key = isNonSync === 0;

            const pts = (currentDecodeTime + cto) / timescale;
            const durSec = duration / timescale;

            if (trunDataOffset + size > u8.length) {
              moofValid = false;
              break;
            }

            const data = new Uint8Array(
              u8.buffer,
              u8.byteOffset + trunDataOffset,
              size
            );
            moofSamples.push({ pts, duration: durSec, data, key });
            trunDataOffset += size;
            currentDecodeTime += duration;
          }
          if (!moofValid) break;
        }
        if (!moofValid) break;
      }

      if (!moofValid) {
        restStart = Math.min(restStart, box.start);
      } else {
        samples.push(...moofSamples);
      }
    } else if (box.type === 'mdat') {
      if (box.start >= restStart) {
        // Already truncated by earlier moof
      } else if (box.truncated) {
        restStart = Math.min(restStart, box.start);
      }
    }
  }

  const rest = new Uint8Array(
    u8.buffer,
    u8.byteOffset + restStart,
    u8.length - restStart
  );
  return { samples, rest };
}

export function readVint(u8, start) {
  if (start >= u8.length) return null;
  const b = u8[start];
  let length = 0;
  let mask = 0x80;
  while (length < 8) {
    length++;
    if (b & mask) break;
    mask >>= 1;
  }
  if (length === 8 && !(b & mask)) return null;
  if (start + length > u8.length) return null;

  let value = b & ~mask;
  let allOnes = (b & ~mask) === (1 << (8 - length)) - 1;
  for (let i = 1; i < length; i++) {
    const nextByte = u8[start + i];
    value = value * 256 + nextByte;
    if (nextByte !== 0xff) allOnes = false;
  }

  if (allOnes && length > 1) {
    value = -1;
  } else if (length === 1 && b === 0xff) {
    value = -1;
  }

  if (value > Number.MAX_SAFE_INTEGER)
    throw new Error('Vint exceeds MAX_SAFE_INTEGER');

  return { value, length };
}

export function parseElements(u8, start, end) {
  const elements = [];
  let p = start;
  while (p < end) {
    if (p >= u8.length) break;
    const idVint = readVint(u8, p);
    if (!idVint) break;
    const idBytes = u8.subarray(p, p + idVint.length);
    const idHex = Array.from(idBytes)
      .map((b) => b.toString(16).padStart(2, '0').toUpperCase())
      .join(' ');

    p += idVint.length;
    const sizeVint = readVint(u8, p);
    if (!sizeVint) break;

    const headerSize = idVint.length + sizeVint.length;
    p += sizeVint.length;

    let size = sizeVint.value;
    if (size === -1) {
      size = end - p; // Until end of parent
    }

    if (p + size > u8.length) {
      elements.push({
        id: idHex,
        start: p - headerSize,
        headerSize,
        size: u8.length - p,
        dataStart: p,
        end: u8.length,
        truncated: true
      });
      break;
    }

    elements.push({
      id: idHex,
      start: p - headerSize,
      headerSize,
      size,
      dataStart: p,
      end: p + size,
      truncated: false
    });
    p += size;
  }
  return elements;
}

const SEGMENT = '18 53 80 67';
const CLUSTER = '1F 43 B6 75';

function levelOne(u8) {
  const top = parseElements(u8, 0, u8.length);
  const segment = top.find((e) => e.id === SEGMENT);
  if (segment) return parseElements(u8, segment.dataStart, segment.end);
  return top;
}

export function classifyWebm(u8) {
  const children = levelOne(u8);
  const hasInfo = children.some((e) => e.id === '15 49 A9 66');
  const hasCluster = children.some((e) => e.id === '1F 43 B6 75');

  if (hasInfo && hasCluster) return 'init+media';
  if (hasInfo) return 'init';
  if (hasCluster) return 'media';
  return 'unknown';
}

export function findTimecodeScale(u8) {
  const elements = parseElements(u8, 0, u8.length);
  const segment = elements.find((e) => e.id === '18 53 80 67');
  if (!segment) return null;
  const children = parseElements(u8, segment.dataStart, segment.end);
  const info = children.find((e) => e.id === '15 49 A9 66');
  if (!info) return null;
  const infoChildren = parseElements(u8, info.dataStart, info.end);
  const tcScale = infoChildren.find((e) => e.id === '2A D7 B1');
  if (!tcScale) return null;

  let value = 0;
  for (let i = 0; i < tcScale.size; i++) {
    value = value * 256 + u8[tcScale.dataStart + i];
  }
  return {
    offset: tcScale.start,
    dataOffset: tcScale.dataStart,
    value,
    size: tcScale.size
  };
}

function encodeVint(val) {
  if (val === -1) return [0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff];
  if (val < 127) return [0x80 | val];
  if (val < 16383) return [0x40 | (val >> 8), val & 0xff];
  if (val < 2097151) return [0x20 | (val >> 16), (val >> 8) & 0xff, val & 0xff];
  if (val < 268435455)
    return [
      0x10 | (val >> 24),
      (val >> 16) & 0xff,
      (val >> 8) & 0xff,
      val & 0xff
    ];
  let buf = [0x08, 0, 0, 0, 0];
  let v = val;
  for (let i = 4; i >= 1; i--) {
    buf[i] = v & 0xff;
    v = Math.floor(v / 256);
  }
  buf[0] |= v;
  return buf;
}

export function rewriteTimecodeScale(u8, speed) {
  const ts = findTimecodeScale(u8);
  const original = ts ? ts.value : 1000000;
  const scaled = Math.round(original / speed);

  if (ts) {
    if (scaled >= 2 ** (8 * ts.size)) {
      throw new RangeError(
        `TimecodeScale ${scaled} does not fit in ${ts.size} bytes`
      );
    }
    const data = new Uint8Array(u8);
    let v = scaled;
    for (let i = ts.size - 1; i >= 0; i--) {
      data[ts.dataOffset + i] = v & 0xff;
      v = Math.floor(v / 256);
    }
    return {
      data,
      original,
      scaled,
      relativeError: Math.abs(scaled - original / speed) / (original / speed)
    };
  } else {
    const elements = parseElements(u8, 0, u8.length);
    const segment = elements.find((e) => e.id === '18 53 80 67');
    const children = parseElements(u8, segment.dataStart, segment.end);
    const info = children.find((e) => e.id === '15 49 A9 66');

    const newElement = new Uint8Array([0x2a, 0xd7, 0xb1, 0x83, 0, 0, 0]);
    let v = scaled;
    for (let i = 2; i >= 0; i--) {
      newElement[4 + i] = v & 0xff;
      v = Math.floor(v / 256);
    }

    const infoIdVint = readVint(u8, info.start);
    const infoSizeVint = readVint(u8, info.start + infoIdVint.length);
    const oldInfoSize = infoSizeVint.value;

    const segmentIdVint = readVint(u8, segment.start);
    const segmentSizeVint = readVint(u8, segment.start + segmentIdVint.length);
    const oldSegmentSize = segmentSizeVint.value;

    const newInfoSize = oldInfoSize === -1 ? -1 : oldInfoSize + 7;
    const newInfoSizeEncoded = encodeVint(newInfoSize);
    const infoSizeDiff = newInfoSizeEncoded.length - infoSizeVint.length;

    const newSegmentSize =
      oldSegmentSize === -1 ? -1 : oldSegmentSize + 7 + infoSizeDiff;
    const newSegmentSizeEncoded = encodeVint(newSegmentSize);
    const segmentSizeDiff =
      newSegmentSizeEncoded.length - segmentSizeVint.length;

    const totalDiff = 7 + infoSizeDiff + segmentSizeDiff;
    const data = new Uint8Array(u8.length + totalDiff);

    let dest = 0;
    const segSizeOffset = segment.start + segmentIdVint.length;
    data.set(u8.subarray(0, segSizeOffset), dest);
    dest += segSizeOffset;

    data.set(newSegmentSizeEncoded, dest);
    dest += newSegmentSizeEncoded.length;

    const infoSizeOffset = info.start + infoIdVint.length;
    data.set(
      u8.subarray(segSizeOffset + segmentSizeVint.length, infoSizeOffset),
      dest
    );
    dest += infoSizeOffset - (segSizeOffset + segmentSizeVint.length);

    data.set(newInfoSizeEncoded, dest);
    dest += newInfoSizeEncoded.length;

    data.set(newElement, dest);
    dest += newElement.length;

    const restStart = infoSizeOffset + infoSizeVint.length;
    data.set(u8.subarray(restStart), dest);

    return {
      data,
      original,
      scaled,
      relativeError: Math.abs(scaled - original / speed) / (original / speed)
    };
  }
}

export function audioConfigFromWebmInit(u8) {
  const elements = parseElements(u8, 0, u8.length);
  const segment = elements.find((e) => e.id === '18 53 80 67');
  if (!segment) return { unsupported: true };
  const children = parseElements(u8, segment.dataStart, segment.end);
  const tracks = children.find((e) => e.id === '16 54 AE 6B');
  if (!tracks) return { unsupported: true };
  const trackEntries = parseElements(u8, tracks.dataStart, tracks.end).filter(
    (e) => e.id === 'AE'
  );

  for (const track of trackEntries) {
    const tChildren = parseElements(u8, track.dataStart, track.end);
    const codecId = tChildren.find((e) => e.id === '86');
    if (codecId) {
      const codecStr = new TextDecoder().decode(
        u8.subarray(codecId.dataStart, codecId.end)
      );
      if (codecStr === 'A_OPUS') {
        let channels = 2;
        let sampleRate = 48000;
        const audio = tChildren.find((e) => e.id === 'E1');
        if (audio) {
          const aChildren = parseElements(u8, audio.dataStart, audio.end);
          const ch = aChildren.find((e) => e.id === '9F');
          if (ch) {
            channels = 0;
            for (let i = 0; i < ch.size; i++)
              channels = channels * 256 + u8[ch.dataStart + i];
          }
        }

        const codecPrivate = tChildren.find((e) => e.id === '63 A2');
        if (!codecPrivate || codecPrivate.truncated)
          return { unsupported: true, codec: 'opus' };
        const description = new Uint8Array(
          u8.buffer,
          u8.byteOffset + codecPrivate.dataStart,
          codecPrivate.size
        );
        const numEl = tChildren.find((e) => e.id === 'D7');
        let trackNumber = 1;
        if (numEl) {
          trackNumber = 0;
          for (let i = 0; i < numEl.size; i++)
            trackNumber = trackNumber * 256 + u8[numEl.dataStart + i];
        }

        return {
          codec: 'opus',
          sampleRate,
          numberOfChannels: channels,
          description,
          trackNumber
        };
      }
    }
  }
  return { unsupported: true };
}

export function demuxClusters(u8, { timecodeScale, trackNumber }) {
  const frames = [];
  let restStart = u8.length;

  const children = levelOne(u8);
  const clusters = children.filter((e) => e.id === CLUSTER);
  // Bytes after the last complete element (e.g. a chunk that ends inside an
  // element header, which parseElements cannot even list) belong to rest too.
  const last = children[children.length - 1];
  if (
    last &&
    !last.truncated &&
    last.end < u8.length &&
    children.every((e) => e.id !== SEGMENT)
  ) {
    restStart = last.end;
  }

  for (const cluster of clusters) {
    if (cluster.truncated) {
      restStart = Math.min(restStart, cluster.start);
      continue;
    }

    let clusterValid = true;
    const cChildren = parseElements(u8, cluster.dataStart, cluster.end);
    const timecodeEl = cChildren.find((e) => e.id === 'E7');
    let clusterTimecode = 0;
    if (timecodeEl) {
      for (let i = 0; i < timecodeEl.size; i++)
        clusterTimecode = clusterTimecode * 256 + u8[timecodeEl.dataStart + i];
    }

    for (const el of cChildren) {
      if (el.truncated) {
        clusterValid = false;
        break;
      }
      if (el.id === 'A3' || el.id === 'A0') {
        let blockDataStart = el.dataStart;
        let blockDataEnd = el.end;
        let isSimple = el.id === 'A3';
        if (!isSimple) {
          const bgChildren = parseElements(u8, el.dataStart, el.end);
          const blockEl = bgChildren.find((e) => e.id === 'A1');
          if (!blockEl) continue;
          if (blockEl.truncated) {
            clusterValid = false;
            break;
          }
          blockDataStart = blockEl.dataStart;
          blockDataEnd = blockEl.end;
        }

        let p = blockDataStart;
        const trackNumVint = readVint(u8, p);
        if (!trackNumVint) {
          clusterValid = false;
          break;
        }
        if (trackNumVint.value !== trackNumber) continue;

        p += trackNumVint.length;
        if (p + 2 > blockDataEnd) {
          clusterValid = false;
          break;
        }

        const relativeTimecode = (u8[p] << 8) | u8[p + 1];
        const rtSigned =
          relativeTimecode >= 32768
            ? relativeTimecode - 65536
            : relativeTimecode;
        p += 2;

        const flags = u8[p++];
        const lacing = (flags & 0x06) >> 1;
        if (lacing !== 0) {
          const err = new Error('Lacing not supported');
          err.name = 'NotSupportedError';
          throw err;
        }

        const key = isSimple ? (flags & 0x80) !== 0 : true;
        const pts = ((clusterTimecode + rtSigned) * timecodeScale) / 1000000000;
        const data = new Uint8Array(
          u8.buffer,
          u8.byteOffset + p,
          blockDataEnd - p
        );

        frames.push({ pts, data, key, start: el.start });
      }
    }

    if (!clusterValid) {
      restStart = Math.min(restStart, cluster.start);
    }
  }

  const validFrames = frames
    .filter((f) => f.start < restStart)
    .map((f) => ({ pts: f.pts, data: f.data, key: f.key }));
  const rest = new Uint8Array(
    u8.buffer,
    u8.byteOffset + restStart,
    u8.length - restStart
  );
  return { frames: validFrames, rest };
}
