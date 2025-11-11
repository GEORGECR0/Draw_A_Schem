import { blockList } from './blocks.js';

const blockIdInput = document.getElementById("blockId");
const blockNameSpan = document.getElementById("blockName");
const blockId2Input = document.getElementById("blockId2");
const blockName2Span = document.getElementById("blockName2");

const drawingGroup = document.getElementById("drawingGroup");
const canvas = document.getElementById("drawCanvas");
const clearBtn = document.getElementById("clearDrawing");
let drawPixels = new Array(32 * 32).fill(0);
let drawing = false;
let activeTool = 'primary';

function renderDrawCanvas() {
  const ctx = canvas.getContext('2d');
  for (let y = 0; y < 32; y++) {
    for (let x = 0; x < 32; x++) {
      const id = drawPixels[y * 32 + x];
      if (!id) {
        ctx.fillStyle = '#111';
      } else if (id === parseInt(blockIdInput.value)) {
        ctx.fillStyle = '#90caf9';
      } else if (blockId2Input && id === parseInt(blockId2Input.value)) {
        ctx.fillStyle = '#a5d6a7';
      } else {
        ctx.fillStyle = '#ccc';
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

blockIdInput.addEventListener("input", () => {
  const id = parseInt(blockIdInput.value);
  blockNameSpan.textContent = blockList[id] || "Unknown";
  renderDrawCanvas();
});

blockId2Input.addEventListener("input", () => {
  const id = parseInt(blockId2Input.value);
  blockName2Span.textContent = blockList[id] || "Unknown";
  renderDrawCanvas();
});

if (drawingGroup && canvas) {
  const radios = document.getElementsByName('drawBlock');
  radios.forEach(r => r.addEventListener('change', (e) => {
    activeTool = e.target.value;
    renderDrawCanvas();
  }));

  function getCanvasCoords(evt) {
    const rect = canvas.getBoundingClientRect();
    const cx = evt.clientX ?? (evt.touches && evt.touches[0].clientX);
    const cy = evt.clientY ?? (evt.touches && evt.touches[0].clientY);
    const relX = Math.floor((cx - rect.left) / rect.width * 32);
    const relY = Math.floor((cy - rect.top) / rect.height * 32);
    return { x: Math.max(0, Math.min(31, relX)), y: Math.max(0, Math.min(31, relY)) };
  }

  canvas.addEventListener('mousedown', (e) => { drawing = true; const p = getCanvasCoords(e); drawAt(p.x,p.y); });
  window.addEventListener('mouseup', () => drawing = false);
  canvas.addEventListener('mousemove', (e) => { if (!drawing) return; const p = getCanvasCoords(e); drawAt(p.x,p.y); });
  canvas.addEventListener('touchstart', (e) => { e.preventDefault(); drawing = true; const p = getCanvasCoords(e); drawAt(p.x,p.y); });
  canvas.addEventListener('touchmove', (e) => { e.preventDefault(); if (!drawing) return; const p = getCanvasCoords(e); drawAt(p.x,p.y); });
  canvas.addEventListener('touchend', () => drawing = false);

  function drawAt(x,y) {
    const ctx = canvas.getContext('2d');
    
    if (activeTool === 'eraser') {
      // Eraser: set pixel to 0 (empty)
      drawPixels[y * 32 + x] = 0;
      ctx.fillStyle = '#111';
      ctx.fillRect(x, y, 1, 1);
    } else {
      // Drawing: set pixel to block ID
      const useBlock = (activeTool === 'primary') ? parseInt(blockIdInput.value) : (blockId2Input ? parseInt(blockId2Input.value) : parseInt(blockIdInput.value));
      if (isNaN(useBlock)) return;
      drawPixels[y * 32 + x] = useBlock;
      if (useBlock === parseInt(blockIdInput.value)) ctx.fillStyle = '#90caf9';
      else if (blockId2Input && useBlock === parseInt(blockId2Input.value)) ctx.fillStyle = '#a5d6a7';
      else ctx.fillStyle = '#ccc';
      ctx.fillRect(x, y, 1, 1);
    }
  }

  clearBtn.addEventListener('click', () => {
    drawPixels.fill(0);
    renderDrawCanvas();
  });

  renderDrawCanvas();
}

document.getElementById("generate").addEventListener("click", async () => {
  const name = document.getElementById("name").value;
  const blockId = parseInt(blockIdInput.value);
  const secondBlockId = blockId2Input ? parseInt(blockId2Input.value) : blockId;
  const size = 32; 

  if (!name) {
    alert("Please enter a schematic name.");
    return;
  }

  if (isNaN(blockId) || blockId < 0 || blockId > 3000) {
    alert("Block ID must be a number between 0 and 3000");
    return;
  }

  if (isNaN(secondBlockId) || secondBlockId < 0 || secondBlockId > 3000) {
    alert("Second Block ID must be a number between 0 and 3000");
    return;
  }

  try {
    const flippedDrawing = new Array(32 * 32);
    for (let y = 0; y < 32; y++) {
      for (let x = 0; x < 32; x++) {
        const srcIdx = y * 32 + x;
        const dstY = 31 - y;
        const dstIdx = dstY * 32 + x;
        flippedDrawing[dstIdx] = drawPixels[srcIdx];
      }
    }
    
    const body = { name, blockId, size, drawing: flippedDrawing, drawWidth: 32, drawHeight: 32 };
    const response = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });


    if (!response.ok) throw new Error("Server error");

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name}.bloxdschem`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert("Error generating schematic: " + err.message);
  }
});

blockIdInput.dispatchEvent(new Event("input"));
