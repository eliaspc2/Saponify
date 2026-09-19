const MAX_PLAIN_BYTES = 32 * 1024 * 1024;

/** Compression happens before encryption; gzip's signature cannot prefix JSON. */
export async function encodeSyncData(data: string): Promise<Uint8Array<ArrayBuffer>> {
    const plain = new TextEncoder().encode(data);
    if (plain.byteLength > MAX_PLAIN_BYTES) throw new Error('Backup excede o limite de 32 MiB antes da compressão.');
    if (plain.byteLength < 65536 || typeof CompressionStream === 'undefined') return plain;
    const stream = new Blob([plain]).stream().pipeThrough(new CompressionStream('gzip'));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    return compressed.byteLength < plain.byteLength ? compressed : plain;
}

export async function decodeSyncData(data: Uint8Array): Promise<string> {
    if (data[0] !== 0x1f || data[1] !== 0x8b) return new TextDecoder().decode(data);
    if (typeof DecompressionStream === 'undefined') {
        throw new Error('Atualize o navegador para ler backups comprimidos.');
    }
    const stream = new Blob([new Uint8Array(data)]).stream().pipeThrough(new DecompressionStream('gzip'));
    const reader = stream.getReader();
    const chunks: ArrayBuffer[] = [];
    let size = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_PLAIN_BYTES) throw new Error('Backup descomprimido excede o limite de 32 MiB.');
            chunks.push(new Uint8Array(value).buffer);
        }
    } finally {
        await reader.cancel();
        reader.releaseLock();
    }
    return new Blob(chunks).text();
}
