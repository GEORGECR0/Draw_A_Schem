import { Buffer } from "buffer";
import avsc from "avsc";

const lightSchema = avsc.Type.forSchema({
    type: "record",
    name: "Schematic",
    fields: [
        { name: "name", type: "string" },
        { name: "x", type: "int" },
        { name: "y", type: "int" },
        { name: "z", type: "int" },
        { name: "sizeX", type: "int" },
        { name: "sizeY", type: "int" },
        { name: "sizeZ", type: "int" },
        {
            name: "chunks",
            type: {
                type: "array",
                items: {
                    type: "record",
                    fields: [
                        { name: "x", type: "int" },
                        { name: "y", type: "int" },
                        { name: "z", type: "int" },
                        { name: "blocks", type: "bytes" }
                    ]
                }
            }
        }
    ]
});

const fullSchema = avsc.Type.forSchema({
    type: "record",
    name: "Schematic",
    fields: [
        { name: 'headers', type: { type: 'fixed', size: 4 }, default: "\u{4}\u{0}\u{0}\u{0}" },
        { name: "name", type: "string" },
        { name: "x", type: "int" },
        { name: "y", type: "int" },
        { name: "z", type: "int" },
        { name: "sizeX", type: "int" },
        { name: "sizeY", type: "int" },
        { name: "sizeZ", type: "int" },
        {
            name: "chunks",
            type: {
                type: "array",
                items: {
                    type: "record",
                    fields: [
                        { name: "x", type: "int" },
                        { name: "y", type: "int" },
                        { name: "z", type: "int" },
                        { name: "blocks", type: "bytes" }
                    ]
                }
            }
        },
        {
            name: "blockdatas",
            type: {
                type: "array",
                items: {
                    type: "record",
                    fields: [
                        { name: "blockX", type: "int" },
                        { name: "blockY", type: "int" },
                        { name: "blockZ", type: "int" },
                        { name: "blockdataStr", type: "string"}
                    ]
                }
            },
            default: []
        },
        { name: "globalX", type: "int", default: 0 },
        { name: "globalY", type: "int", default: 0 },
        { name: "globalZ", type: "int", default: 0 },
        { name: 'wtvthisis', type: { type: 'fixed', size: 2 }, default: "\u{0}\u{0}" },
    ]
});

const resolver = lightSchema.createResolver(fullSchema);

const parse = function(buffer) {
    const avroJson = lightSchema.fromBuffer(buffer, resolver, true);
    const json = {
        name: avroJson.name,
        pos: [ avroJson.x, avroJson.y, avroJson.z ],
        size: [ avroJson.sizeX, avroJson.sizeY, avroJson.sizeZ ],
        chunks: []
    };

    for(const avroChunk of avroJson.chunks) {
        const chunk = {
            pos: [ avroChunk.x, avroChunk.y, avroChunk.z ],
            blocks: []
        };

        let avroI = 0;
        function decodeLEB128() {
            let shift = 0;
            let value = 0;
        
            while(true) {
                const byte = avroChunk.blocks[avroI++];
                value |= (byte & 127) << shift;
                shift += 7;
                if((byte & 128) !== 128) {
                    break;
                }
            }
            return value;
        }

        while(avroI < avroChunk.blocks.length) {
            const amount = decodeLEB128();
            const id = decodeLEB128();
            for(let i = 0; i < amount; i++) {
                chunk.blocks.push(id);
            }
        }

        json.chunks.push(chunk);
    }

    return json;
}

const write = function(json) {
    const avroJson = {
        name: json.name,
        x: json.pos[0],
        y: json.pos[1],
        z: json.pos[2],
        sizeX: json.size[0],
        sizeY: json.size[1],
        sizeZ: json.size[2],
        chunks: []
    };

    function encodeLEB128(value) {
        const bytes = new Array();
        while((value & -128) != 0) {
            let schemId = value & 127 | 128;
            bytes.push(schemId);
            value >>>= 7;
        }
        bytes.push(value);
        return bytes;
    }

    for(const chunk of json.chunks) {
        const avroChunk = {
            x: chunk.pos[0],
            y: chunk.pos[1],
            z: chunk.pos[2]
        };

        const RLEArray = [];
        if (!Array.isArray(chunk.blocks) || chunk.blocks.length === 0) {
            avroChunk.blocks = Buffer.from(RLEArray);
            avroJson.chunks.push(avroChunk);
            continue;
        }

        let currId = chunk.blocks[0];
        let currAmt = 1;
        for (let i = 1; i <= chunk.blocks.length; i++) {
            const id = chunk.blocks[i];
            if (id === currId) {
                currAmt++;
            } else {
                RLEArray.push(...encodeLEB128(currAmt));
                RLEArray.push(...encodeLEB128(currId));
                currAmt = 1;
                currId = id;
            }
        }

        avroChunk.blocks = Buffer.from(RLEArray);
        avroJson.chunks.push(avroChunk);
    }

    return {
        schems: [fullSchema.toBuffer(avroJson)],
        sliceSize: json.size[0]
    };
}

export default function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    const { name, blockId, size, drawing, drawWidth, drawHeight } = req.body;

    if (!name || typeof blockId !== "number") {
        return res.status(400).json({ error: "Missing name or blockId" });
    }

    // Always use drawing mode with fixed size 32
    const sizeValue = 32;
    const w = 32;
    const h = 32;
    const depth = 32;

    let blocks = [];
    let outSizeX = w;
    let outSizeY = h;
    let outSizeZ = depth;
    
    if (Array.isArray(drawing) && drawing.length > 0) {
        const expected = w * h;
        const drawArr = drawing.slice(0, expected);

        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    const idx = y * w + x;
                    const id = drawArr[idx] || 0;
                    blocks.push(id);
                }
            }
        }
    } else {
        // Fallback: fill with blockId if no drawing provided
        for (let z = 0; z < depth; z++) {
            for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                    blocks.push(blockId);
                }
            }
        }
    }

    if (blocks.length !== sizeValue * sizeValue * sizeValue) {
        console.error(`Block count mismatch. Expected ${sizeValue * sizeValue * sizeValue}, got ${blocks.length}`);
    }

    const schematic = {
        name: name,
        pos: [0, 0, 0],
        size: [outSizeX, outSizeY, outSizeZ],
        chunks: [{
            pos: [0, 0, 0],
            blocks: blocks
        }]
    };
    const result = write(schematic);
    const buf = result.schems[0];

    res.setHeader("Content-Disposition", `attachment; filename="${name}.bloxdschem"`);
    res.setHeader("Content-Type", "application/octet-stream");
    res.send(buf);
}
