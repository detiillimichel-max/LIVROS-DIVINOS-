(() => {
  const OWNER = 'detiillimichel-max';
  const REPO = 'LIVROS-DIVINOS-';
  const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
  const $ = id => document.getElementById(id);
  const grid = $('bookGrid'), status = $('statusMessage'), search = $('searchInput');
  let books = [], filtered = [], currentPdf = null, currentPage = 1, scale = 1.15, renderTask = null, toastTimer;
  const pdfjs = () => window.pdfjsLib;
  if (pdfjs()) pdfjs().GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const titleFrom = name => decodeURIComponent(name).replace(/\.[^.]+$/, '').replace(/[_-]+/g,' ').replace(/\s+/g,' ').trim();
  const escapeHtml = s => String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const COVER_FILES = {
    'bm_T (1).pdf': 'Screenshot_20261104-184816_Chrome.png',
    'APRENDA DAS HISTÓRIS BIBLICAS .pdf': 'Screenshot_20261104-185138_Chrome.png',
    'JEREMIAS E A MENSAGEM DE DEUS PARA NOS .pdf': 'Screenshot_20261104-185319_Chrome.png',
    'PRINCIPIIOS BIBLICOS PARA UMA VIDA CRISTÃ.pdf': 'Screenshot_20261104-185718_JW Library.png',
    'VENHA SER MEU SEGUIDOR .pdf': 'Screenshot_20261104-185942_Chrome.png',
    'VIVA TENDO BEM EM MENTE O DIA DE JEOVÁ.pdf': 'Screenshot_20261104-190142_Chrome.png'
  };
  const colors = [['#354d4b','#182d32'],['#51413b','#2b2528'],['#45415b','#25263d'],['#4a5141','#242e29'],['#574b39','#2c2924'],['#3c4b5b','#202b39']];
  function cover(book,i){
    const c=colors[i%colors.length];
    const image=book.coverUrl ? `<img class="cover-image" src="${book.coverUrl}" alt="Capa de ${escapeHtml(book.title)}" loading="lazy">` : `<span class="cover-symbol">✦</span><span class="cover-label">${escapeHtml(book.title)}</span>`;
    return `<div class="cover-wrap" style="background:radial-gradient(circle at 50% 35%, ${c[0]}, ${c[1]} 76%)">${image}</div>`;
  }
  function render(){
    const term=search.value.trim().toLocaleLowerCase('pt-BR');
    filtered=books.filter(b=>b.title.toLocaleLowerCase('pt-BR').includes(term));
    grid.innerHTML=filtered.map((b,i)=>{const original=books.indexOf(b);return `<article class="book-card" data-index="${original}" tabindex="0" role="button" aria-label="Abrir ${escapeHtml(b.title)}">${cover(b,original)}<span class="book-open">LER AGORA ↗</span><div class="book-meta"><h3>${escapeHtml(b.title)}</h3><p>PDF · Publicação digital</p></div></article>`;}).join('');
    $('bookCount').textContent=books.length;
    $('libraryHint').textContent=books.length ? `${books.length} publicação(ões) disponíveis na sua estante` : 'Adicione arquivos PDF à raiz do repositório para vê-los aqui.';
    $('emptyState').hidden=filtered.length!==0;
    grid.querySelectorAll('.book-card').forEach(card=>{const open=()=>openBook(books[Number(card.dataset.index)]);card.addEventListener('click',open);card.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}});});
  }
  async function loadLibrary(){
    status.hidden=false;status.innerHTML='<span class="loader"></span> Procurando publicações no GitHub…';
    try{
      const response=await fetch(API,{headers:{Accept:'application/vnd.github+json'}});
      if(!response.ok) throw new Error(response.status===403?'Limite temporário da API do GitHub. Tente novamente em alguns instantes.':'Não foi possível acessar os arquivos do repositório.');
      const files=await response.json();
      books=files.filter(f=>f.type==='file'&&/\\.pdf$/i.test(f.name)).map(f=>({name:f.name,title:titleFrom(f.name),url:f.download_url||`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${encodeURIComponent(f.name)}`,coverUrl:COVER_FILES[f.name]?`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${encodeURIComponent(COVER_FILES[f.name])}`:null,size:f.size}));
      books.sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));
      status.hidden=true;render();
    }catch(err){status.innerHTML='<span>⚠</span> '+escapeHtml(err.message);$('libraryHint').textContent='Verifique sua conexão e tente atualizar.';}
  }
  function notify(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
  async function openBook(book){
    if(!book)return;
    $('reader').classList.add('open');$('reader').setAttribute('aria-hidden','false');document.body.style.overflow='hidden';
    $('readerTitle').textContent=book.title;$('readerPageLabel').textContent='Carregando documento…';$('downloadBook').href=book.url;
    $('pdfLoading').hidden=false;$('readerError').hidden=true;$('pdfCanvas').hidden=true;
    $('prevPage').disabled=$('nextPage').disabled=true;
    if(!pdfjs()){showReaderError('O leitor PDF não carregou. Use o botão Baixar para abrir o documento.');return;}
    try{
      if(currentPdf){await currentPdf.destroy();currentPdf=null;}
      currentPdf=await pdfjs().getDocument({url:book.url}).promise;currentPage=1;scale=1.15;
      $('pdfLoading').hidden=true;$('pdfCanvas').hidden=false;
      await renderPage();notify('Livro aberto: '+book.title);
    }catch(err){console.error(err);showReaderError('Não foi possível renderizar este PDF neste momento. Você pode baixar o arquivo pelo botão acima.');}
  }
  function showReaderError(message){$('pdfLoading').hidden=true;$('pdfCanvas').hidden=true;$('readerError').textContent=message;$('readerError').hidden=false;$('readerPageLabel').textContent='Visualização indisponível';}
  async function renderPage(){
    if(!currentPdf)return;
    if(renderTask){try{renderTask.cancel();}catch(_){}}
    const page=await currentPdf.getPage(currentPage),canvas=$('pdfCanvas'),ctx=canvas.getContext('2d');
    const viewport=page.getViewport({scale});canvas.width=viewport.width;canvas.height=viewport.height;
    renderTask=page.render({canvasContext:ctx,viewport});
    try{await renderTask.promise;}catch(e){if(e.name!=='RenderingCancelledException')throw e;}
    $('pageCounter').textContent=currentPage+' / '+currentPdf.numPages;
    $('readerPageLabel').textContent=currentPdf.numPages+' página(s)';
    $('prevPage').disabled=currentPage<=1;$('nextPage').disabled=currentPage>=currentPdf.numPages;
    $('zoomValue').textContent=Math.round(scale*100)+'%';
  }
  function closeReader(){if(renderTask){try{renderTask.cancel();}catch(_){}}$('reader').classList.remove('open');$('reader').setAttribute('aria-hidden','true');document.body.style.overflow='';}
  $('closeReader').addEventListener('click',closeReader);
  $('prevPage').addEventListener('click',()=>{if(currentPage>1){currentPage--;renderPage();}});
  $('nextPage').addEventListener('click',()=>{if(currentPdf&&currentPage<currentPdf.numPages){currentPage++;renderPage();}});
  $('zoomIn').addEventListener('click',()=>{scale=Math.min(2.5,scale+.15);renderPage();});
  $('zoomOut').addEventListener('click',()=>{scale=Math.max(.55,scale-.15);renderPage();});
  $('fitWidth').addEventListener('click',async()=>{if(!currentPdf)return;const p=await currentPdf.getPage(currentPage),base=p.getViewport({scale:1}),available=$('pdfViewport').clientWidth-24;scale=Math.max(.5,Math.min(2.5,available/base.width));renderPage();});
  search.addEventListener('input',render);
  $('refreshBtn').addEventListener('click',loadLibrary);
  $('themeToggle').addEventListener('click',()=>{document.body.classList.toggle('light');$('themeToggle').textContent=document.body.classList.contains('light')?'☾':'☼';});
  document.addEventListener('keydown',e=>{if(!$('reader').classList.contains('open'))return;if(e.key==='Escape')closeReader();if(e.key==='ArrowRight')$('nextPage').click();if(e.key==='ArrowLeft')$('prevPage').click();});
  loadLibrary();
})();