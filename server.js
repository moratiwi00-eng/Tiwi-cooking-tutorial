const http = require('http');
const fs = require('fs');
const path = require('path');

function loadEnv() {
  const p = path.join(__dirname, '.env');
  if (!fs.existsSync(p)) return;
  for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}
loadEnv();
const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const MIME = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};

function send(res, status, data, type='application/json; charset=utf-8') {
  res.writeHead(status, {'Content-Type': type, 'X-Content-Type-Options':'nosniff', 'Cache-Control':'no-store'});
  res.end(type.startsWith('application/json') ? JSON.stringify(data) : data);
}
function readBody(req, limit=8*1024*1024) {
  return new Promise((resolve, reject) => {
    let data = ''; req.on('data', c => { data += c; if (data.length > limit) { reject(new Error('Ukuran permintaan terlalu besar.')); req.destroy(); }});
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { reject(new Error('Format JSON tidak valid.')); }});
    req.on('error', reject);
  });
}
async function apiFetch(endpoint, payload) {
  const key = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error('API belum dikonfigurasi. Salin .env.example menjadi .env lalu isi OPENROUTER_API_KEY.'), {status:503});
  const base = (process.env.OPENROUTER_BASE_URL || process.env.OPENAI_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/+$/, '');
  const response = await fetch(base + endpoint, {
    method:'POST',
    headers:{'Authorization':'Bearer '+key, 'Content-Type':'application/json'},
    body:JSON.stringify(payload)
  });
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = {error:{message:raw.slice(0,500)}}; }
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || `Layanan AI gagal (${response.status}).`), {status:response.status});
  return data;
}

function localPlan(b) {
  const recipe = String(b.recipe || 'Tutorial memasak').trim();
  const rawSteps = String(b.steps || '').split(/\n|\r|(?<=\.)\s+/).map(x => x.replace(/^\s*(?:\d+[.)]|[-•])\s*/, '').trim()).filter(Boolean);
  const count = Math.max(2, Math.min(20, Number(b.storyboardCount || 6)));
  const sceneCount = Math.max(1, Math.min(10, Number(b.sceneCount || 3)));
  const style = String(b.style || 'ultra-realistic');
  const ratio = String(b.ratio || '9:16');
  const mode = String(b.mode || 'faceless');
  const steps = rawSteps.length ? rawSteps : ['Siapkan bahan dan peralatan', 'Lakukan proses memasak sesuai resep', 'Periksa kematangan', 'Sajikan hidangan'];
  const panels = Array.from({length:count}, (_,i) => {
    const step = steps[Math.min(i, steps.length-1)];
    const stage = i===0 ? 'Persiapan bahan dan peralatan' : i===count-1 ? 'Penyajian hasil akhir' : `Proses ${i+1}`;
    const action = rawSteps.length ? step : stage;
    return {number:i+1, stepTitle: rawSteps.length ? (i===0 ? `Persiapan: ${step}` : i===count-1 ? `Penyajian: ${step}` : `Langkah ${i+1}: ${step}`) : stage, action, visualDescription:`Visual tutorial memasak ${recipe}: ${action}. Tampilkan kondisi bahan dan alat yang sesuai dengan tahap ini, komposisi jelas dan mudah diikuti.`, continuityNotes:'Jaga jumlah dan kondisi bahan, alat masak, posisi meja, arah cahaya, serta perkembangan kematangan tetap konsisten.'};
  });
  const scenes = Array.from({length:sceneCount}, (_,i) => {
    const first = panels[Math.min(i*2, panels.length-1)];
    const second = panels[Math.min(i*2+1, panels.length-1)];
    const panelNumbers = [...new Set([first.number, second.number])];
    return {number:i+1, panelNumbers, action:`${first.action}${first.number!==second.number ? ' lalu '+second.action : ''}`, imagePrompt:'', videoPrompt:''};
  });
  return {recipeTitle:recipe, assumptions:['Mode lokal aktif: rencana dibuat dari teks resep yang kamu masukkan, bukan oleh model AI. Periksa urutan dan detailnya sebelum produksi.', ...(b.referenceDataUrl ? ['Gambar referensi belum dianalisis dalam mode lokal.'] : [])], ingredients:[], panels, scenes, safetyNotes:['Ikuti waktu, suhu, dan tingkat kematangan yang sesuai dengan resep serta jenis bahan.']};
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return send(res, 200, {ok:true, apiConfigured:Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY), textModel:process.env.OPENROUTER_TEXT_MODEL || process.env.OPENAI_TEXT_MODEL || 'google/gemini-2.5-flash', imageModel:process.env.OPENROUTER_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || 'google/gemini-2.5-flash-image'});
  }
  if (req.method === 'POST' && url.pathname === '/api/plan') {
    try {
      const b = await readBody(req, 12*1024*1024);
      if (!b.recipe || !String(b.recipe).trim()) return send(res, 400, {error:'Nama menu wajib diisi.'});
      if (!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY)) return send(res, 200, {result:localPlan(b), mode:'local'});
      const count = Math.max(2, Math.min(20, Number(b.storyboardCount || 6)));
      const prompt = `Buat rencana storyboard tutorial memasak berbahasa Indonesia untuk menu: ${String(b.recipe).slice(0,180)}.
Langkah resep dari pengguna (jika ada, pertahankan dan jangan mengarang langkah kritis): ${String(b.steps || 'Belum diberikan; buat draf umum dan tandai semua asumsi untuk diperiksa.').slice(0,8000)}
Preferensi: mode ${b.mode || 'faceless'}, gaya ${b.style || 'ultra-realistic'}, rasio ${b.ratio || '9:16'}, jumlah panel storyboard ${count}, scene prompt ${Math.max(1,Math.min(10,Number(b.sceneCount||3)))}.
Referensi gambar: ${b.referenceDataUrl ? 'Gambar referensi disertakan sebagai input gambar. Analisis isi foto dan gunakan sebagai acuan plating, warna, bahan, peralatan, dan suasana visual; jangan menganggap detail yang tidak terlihat sebagai fakta.' : 'Tidak ada'}.
Aturan: mulai dari persiapan bahan; akhiri dengan penyajian/hasil akhir; jangan melompati langkah; jangan menambah bahan yang tidak disebutkan tanpa menandainya sebagai saran; keselamatan pangan harus masuk bila relevan. Setiap panel harus menggambarkan satu aksi yang jelas dan realistis.
Kembalikan HANYA JSON valid dengan struktur {"recipeTitle":"...","assumptions":["..."],"ingredients":["..."],"panels":[{"number":1,"stepTitle":"...","action":"...","visualDescription":"...","continuityNotes":"..."}],"scenes":[{"number":1,"panelNumbers":[1,2],"action":"...","imagePrompt":"...","videoPrompt":"..."}],"safetyNotes":["..."]}.
Jumlah panels harus tepat ${count}. Jumlah scenes harus tepat ${Math.max(1,Math.min(10,Number(b.sceneCount||3)))}. Setiap scene menghubungkan dua panel berurutan (1&2, 3&4, dst); jika panel habis, panelNumbers boleh berisi satu panel terakhir saja. Sertakan di setiap imagePrompt/videoPrompt: anti-anomaly, continuity lock, environment lock, food/prop lock; character lock sesuai mode. Jangan menulis teks overlay dalam gambar.`;
      const userContent = [{type:'text', text:prompt}];
      if (b.referenceDataUrl && /^data:image\/(png|jpeg|webp);base64,/i.test(b.referenceDataUrl)) {
        userContent.push({type:'image_url', image_url:{url:b.referenceDataUrl}});
      }
      const data = await apiFetch('/chat/completions', {
        model: process.env.OPENROUTER_TEXT_MODEL || process.env.OPENAI_TEXT_MODEL || 'google/gemini-2.5-flash',
        temperature:0.3,
        response_format:{type:'json_object'},
        messages:[
          {role:'system',content:'Kamu adalah food production director yang teliti. Jika ada gambar, analisis hanya detail visual yang terlihat. Jangan mengklaim resep sudah terverifikasi jika belum. Output JSON valid saja.'},
          {role:'user',content:userContent}
        ]
      });
      let result;
      try { result = JSON.parse(data.choices?.[0]?.message?.content || '{}'); }
      catch { throw new Error('AI mengembalikan format yang tidak dapat dibaca. Coba lagi.'); }
      return send(res, 200, {result});
    } catch(e) { return send(res, e.status || 500, {error:e.message || 'Gagal membuat rencana.'}); }
  }
  if (req.method === 'POST' && url.pathname === '/api/storyboard-image') {
    try {
      const b = await readBody(req, 10*1024*1024);
      if (!b.prompt || !String(b.prompt).trim()) return send(res, 400, {error:'Prompt gambar kosong.'});
      if (!(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY)) return send(res, 503, {error:'Rencana dan prompt sudah bisa dibuat tanpa API. Untuk menghasilkan file gambar storyboard sungguhan, aplikasi perlu tersambung ke layanan pembuat gambar AI; tidak ada biaya atau API key yang akan diminta dari halaman ini.'});
      const payload = {model:process.env.OPENROUTER_IMAGE_MODEL || process.env.OPENAI_IMAGE_MODEL || 'google/gemini-2.5-flash-image', prompt:String(b.prompt).slice(0,10000), aspect_ratio:b.aspectRatio || '9:16', resolution:process.env.OPENROUTER_IMAGE_RESOLUTION || '1K', n:1};
      const data = await apiFetch('/images', payload);
      const item = data.data?.[0];
      if (item?.b64_json) return send(res, 200, {image:`data:${item.media_type || 'image/png'};base64,${item.b64_json}`, cost:data.usage?.cost ?? null});
      if (item?.url) return send(res, 200, {image:item.url});
      throw new Error('Layanan gambar tidak mengembalikan file gambar. Periksa dukungan model dan endpoint provider.');
    } catch(e) { return send(res, e.status || 500, {error:e.message || 'Gagal menghasilkan gambar.'}); }
  }
  if (req.method === 'GET') {
    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    const file = path.normalize(path.join(ROOT, pathname));
    if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT,'index.html')) return send(res, 403, 'Forbidden', 'text/plain');
    fs.readFile(file, (err, data) => {
      if (err) return send(res, 404, 'File tidak ditemukan.', 'text/plain; charset=utf-8');
      send(res, 200, data, MIME[path.extname(file)] || 'application/octet-stream');
    });
    return;
  }
  send(res, 404, {error:'Endpoint tidak ditemukan.'});
});
server.listen(PORT, '0.0.0.0', () => console.log(`TIWI COOKING TUTORIAL berjalan di http://localhost:${PORT}`));
