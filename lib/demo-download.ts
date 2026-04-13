import { promises as fs } from "fs";
import path from "path";
import { normalizeDemoClientId, readDemoManifest, resolveDemoPublicDir } from "@/lib/demo-bundle";

const CRC32_TABLE = createCrc32Table();

type ZipFileEntry = {
  name: string;
  data: Buffer;
  modifiedAt: Date;
};

type ZipDirectoryEntry = ZipFileEntry & {
  crc: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
  dosTime: number;
  dosDate: number;
};

function createCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }

  return table;
}

function crc32(buffer: Buffer) {
  let value = 0xffffffff;

  for (const byte of buffer) {
    value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8);
  }

  return (value ^ 0xffffffff) >>> 0;
}

function toDosDateTime(input: Date) {
  const date = Number.isNaN(input.getTime()) ? new Date() : input;
  const year = Math.max(date.getFullYear(), 1980);
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = Math.floor(date.getSeconds() / 2);

  return {
    dosTime: (hours << 11) | (minutes << 5) | seconds,
    dosDate: ((year - 1980) << 9) | (month << 5) | day,
  };
}

function createLocalHeader(entry: ZipDirectoryEntry) {
  const fileName = Buffer.from(entry.name, "utf8");
  const header = Buffer.alloc(30 + fileName.length);

  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(entry.dosTime, 10);
  header.writeUInt16LE(entry.dosDate, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.compressedSize, 18);
  header.writeUInt32LE(entry.uncompressedSize, 22);
  header.writeUInt16LE(fileName.length, 26);
  header.writeUInt16LE(0, 28);
  fileName.copy(header, 30);

  return header;
}

function createCentralHeader(entry: ZipDirectoryEntry) {
  const fileName = Buffer.from(entry.name, "utf8");
  const header = Buffer.alloc(46 + fileName.length);

  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.uncompressedSize, 24);
  header.writeUInt16LE(fileName.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(entry.localOffset, 42);
  fileName.copy(header, 46);

  return header;
}

function createEndOfCentralDirectoryRecord(entryCount: number, centralSize: number, centralOffset: number) {
  const header = Buffer.alloc(22);

  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(entryCount, 8);
  header.writeUInt16LE(entryCount, 10);
  header.writeUInt32LE(centralSize, 12);
  header.writeUInt32LE(centralOffset, 16);
  header.writeUInt16LE(0, 20);

  return header;
}

function buildZip(entries: ZipFileEntry[]) {
  const fileSections: Buffer[] = [];
  const directoryEntries: ZipDirectoryEntry[] = [];
  let localOffset = 0;

  for (const entry of entries) {
    const normalizedName = entry.name.replaceAll("\\", "/");
    const { dosDate, dosTime } = toDosDateTime(entry.modifiedAt);
    const directoryEntry: ZipDirectoryEntry = {
      ...entry,
      name: normalizedName,
      crc: crc32(entry.data),
      compressedSize: entry.data.length,
      uncompressedSize: entry.data.length,
      localOffset,
      dosDate,
      dosTime,
    };

    const localHeader = createLocalHeader(directoryEntry);
    fileSections.push(localHeader, entry.data);
    localOffset += localHeader.length + entry.data.length;
    directoryEntries.push(directoryEntry);
  }

  const centralDirectory = directoryEntries.map((entry) => createCentralHeader(entry));
  const centralSize = centralDirectory.reduce((total, item) => total + item.length, 0);
  const endRecord = createEndOfCentralDirectoryRecord(directoryEntries.length, centralSize, localOffset);

  return Buffer.concat([...fileSections, ...centralDirectory, endRecord]);
}

function formatFileStamp(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}${month}${day}-${hours}${minutes}`;
}

export async function buildDemoDownloadResponse(clientId?: string | null) {
  const manifest = await readDemoManifest(clientId);

  if (!manifest?.items.length) {
    return Response.json({ error: "Demo bundle is empty." }, { status: 404 });
  }

  const demoPublicDir = resolveDemoPublicDir(clientId);
  const entries = await Promise.all(
    manifest.items.map(async (item) => {
      const filePath = path.join(demoPublicDir, item.fileName);
      const [data, stats] = await Promise.all([fs.readFile(filePath), fs.stat(filePath)]);

      return {
        name: item.fileName,
        data,
        modifiedAt: stats.mtime,
      } satisfies ZipFileEntry;
    }),
  );

  const zipBuffer = buildZip(entries);
  const normalizedClientId = normalizeDemoClientId(clientId);
  const fileNamePrefix = normalizedClientId ? `mornchat-demo-${normalizedClientId}` : "mornchat-demo-bundle";
  const fileName = `${fileNamePrefix}-${formatFileStamp(new Date())}.zip`;

  return new Response(zipBuffer, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Content-Length": String(zipBuffer.length),
      "Cache-Control": "no-store",
    },
  });
}
