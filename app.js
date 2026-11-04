(() => {
  const OWNER = 'detiillimichel-max';
  const REPO = 'LIVROS-DIVINOS-';
  const API = `https://api.github.com/repos/${OWNER}/${REPO}/contents/`;
  const $ = id => document.getElementById(id);
  const grid = $('bookGrid'), status = $('statusMessage'), search = $('searchInput');
  let books = [], filtered = [], currentPdf = null, currentPage = 1, scale = 1.15, renderTask = null, toastTimer;
  let speechRunId = 0, speechChunks = [], speechIndex = 0, speechRate = 1;
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
      books=files.filter(f=>f.type==='file'&&/\.pdf$/i.test(f.name)).map(f=>({name:f.name,title:titleFrom(f.name),url:f.download_url||`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${encodeURIComponent(f.name)}`,coverUrl:COVER_FILES[f.name]?`https://raw.githubusercontent.com/${OWNER}/${REPO}/main/${encodeURIComponent(COVER_FILES[f.name])}`:null,size:f.size}));
      books.sort((a,b)=>a.title.localeCompare(b.title,'pt-BR'));
      status.hidden=true;render();
    }catch(err){status.innerHTML='<span>⚠</span> '+escapeHtml(err.message);$('libraryHint').textContent='Verifique sua conexão e tente atualizar.';}
  }
  function notify(message){const el=$('toast');el.textContent=message;el.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
  function speechSupported(){return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;}
  function updateSpeechStatus(message){$('speechStatus').textContent=message;}
  function stopSpeech(message='Leitura parada'){
    speechRunId++;
    if(speechSupported())window.speechSynthesis.cancel();
    speechChunks=[];speechIndex=0;
    $('pauseSpeech').textContent='⏸ Pausar';$('pauseSpeech').disabled=true;$('stopSpeech').disabled=true;$('readAloud').disabled=!speechSupported();
    updateSpeechStatus(message);
  }
  function splitSpeechText(text,max=900){
    const sentences=text.match(/[^.!?]+[.!?]+|[^.!?]+$/g)||[text];
    const chunks=[];let part='';
    for(const sentence of sentences){
      const s=sentence.trim();if(!s)continue;
      if((part+' '+s).trim().length<=max){part=(part+' '+s).trim();continue;}
      if(part)chunks.push(part);
      if(s.length<=max){part=s;continue;}
      const words=s.split(/\s+/);part='';let piece='';
      for(const word of words){if((piece+' '+word).trim().length>max){if(piece)chunks.push(piece);piece=word;}else piece=(piece+' '+word).trim();}
      part=piece;
    }
    if(part)chunks.push(part);return chunks;
  }
  function reconstructPdfText(items){
    let output='', previous=null;
    for(const item of items){
      const part=(item.str||'');
      if(!part)continue;
      const transform=item.transform||[];
      const x=Number(transform[4]);
      const y=Number(transform[5]);
      const fontSize=Math.max(1,Math.abs(Number(transform[3])||Number(transform[0])||10));
      if(previous){
        const sameLine=Number.isFinite(y)&&Number.isFinite(previous.y)&&Math.abs(y-previous.y)<=Math.max(2,fontSize*.45);
        if(!sameLine){
          output=output.replace(/[ \\t]+$/,'')+'\\n';
        }else if(Number.isFinite(x)&&Number.isFinite(previous.endX)){
          const gap=x-previous.endX;
          const threshold=Math.max(1.5,fontSize*.18);
          if(gap>threshold&&!/\\s$/.test(output)&&!/^\\s/.test(part))output+=' ';
        }
      }
      output+=part;
      const width=Number(item.width);
      previous={y,endX:Number.isFinite(x)&&Number.isFinite(width)?x+width:NaN};
      if(item.hasEOL){output=output.replace(/[ \\t]+$/,'')+'\\n';previous=null;}
    }
    return output.replace(/[ \\t]+/g,' ').replace(/ *\\n */g,'\\n').replace(/\\n{3,}/g,'\\n\\n').trim();
  }
  async function readPageAloud(runId){
    if(runId!==speechRunId||!currentPdf)return;
    try{
      const page=await currentPdf.getPage(currentPage);
      const content=await page.getTextContent();
      const text=reconstructPdfText(content.items);
      if(!text){stopSpeech('Esta página não contém texto selecionável.');notify('Este PDF pode precisar de OCR para leitura em voz alta.');return;}
      speechChunks=splitSpeechText(text);speechIndex=0;
      $('pauseSpeech').disabled=false;$('stopSpeech').disabled=false;$('readAloud').disabled=true;
      updateSpeechStatus('Lendo página '+currentPage+' de '+currentPdf.numPages);
      speakNextChunk(runId);
    }catch(error){console.error(error);stopSpeech('Não foi possível extrair o texto desta página.');}
  }
  function speakNextChunk(runId){
    if(runId!==speechRunId||!currentPdf)return;
    if(speechIndex>=speechChunks.length){
      if(currentPage<currentPdf.numPages){currentPage++;renderPage().then(()=>readPageAloud(runId)).catch(()=>stopSpeech('Erro ao avançar de página.'));return;}
      stopSpeech('Leitura concluída.');notify('Você chegou ao final do livro.');return;
    }
    const utterance=new SpeechSynthesisUtterance(speechChunks[speechIndex++]);
    utterance.lang='pt-BR';utterance.rate=speechRate;
    const voices=window.speechSynthesis.getVoices();
    const voice=voices.find(v=>/^pt-BR$/i.test(v.lang))||voices.find(v=>/^pt/i.test(v.lang));
    if(voice)utterance.voice=voice;
    utterance.onend=()=>speakNextChunk(runId);
    utterance.onerror=event=>{if(runId===speechRunId&&event.error!=='canceled'&&event.error!=='interrupted')stopSpeech('A voz do Android encontrou um erro.');};
    window.speechSynthesis.speak(utterance);
  }
  function startSpeech(){
    if(!currentPdf)return;
    if(!speechSupported()){notify('A leitura em voz alta não é suportada neste navegador.');return;}
    stopSpeech('Preparando leitura…');
    const runId=speechRunId;
    readPageAloud(runId);
  }
  async function openBook(book){
    if(!book)return;
    stopSpeech('Abra um livro para ouvir a leitura.');
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
  function closeReader(){stopSpeech('Leitura parada');if(renderTask){try{renderTask.cancel();}catch(_){}}$('reader').classList.remove('open');$('reader').setAttribute('aria-hidden','true');document.body.style.overflow='';}
  $('closeReader').addEventListener('click',closeReader);
  $('prevPage').addEventListener('click',()=>{if(currentPage>1){stopSpeech('Leitura pausada ao mudar de página');currentPage--;renderPage();}});
  $('nextPage').addEventListener('click',()=>{if(currentPdf&&currentPage<currentPdf.numPages){stopSpeech('Leitura pausada ao mudar de página');currentPage++;renderPage();}});
  $('zoomIn').addEventListener('click',()=>{scale=Math.min(2.5,scale+.15);renderPage();});
  $('zoomOut').addEventListener('click',()=>{scale=Math.max(.55,scale-.15);renderPage();});
  $('fitWidth').addEventListener('click',async()=>{if(!currentPdf)return;const p=await currentPdf.getPage(currentPage),base=p.getViewport({scale:1}),available=$('pdfViewport').clientWidth-24;scale=Math.max(.5,Math.min(2.5,available/base.width));renderPage();});
  $('readAloud').addEventListener('click',startSpeech);
  $('pauseSpeech').addEventListener('click',()=>{if(!speechSupported())return;if(window.speechSynthesis.paused){window.speechSynthesis.resume();$('pauseSpeech').textContent='⏸ Pausar';updateSpeechStatus('Leitura em andamento');}else{window.speechSynthesis.pause();$('pauseSpeech').textContent='▶ Continuar';updateSpeechStatus('Leitura pausada');}});
  $('stopSpeech').addEventListener('click',()=>stopSpeech());
  $('speechRate').addEventListener('change',e=>{speechRate=Number(e.target.value)||1;});
  if(!speechSupported()){$('readAloud').disabled=true;updateSpeechStatus('Leitura por voz indisponível neste navegador.');}else{updateSpeechStatus('Voz em português do Android');}
  search.addEventListener('input',render);
  $('refreshBtn').addEventListener('click',loadLibrary);
  $('themeToggle').addEventListener('click',()=>{document.body.classList.toggle('light');$('themeToggle').textContent=document.body.classList.contains('light')?'☾':'☼';});
  document.addEventListener('keydown',e=>{if(!$('reader').classList.contains('open'))return;if(e.key==='Escape')closeReader();if(e.key==='ArrowRight')$('nextPage').click();if(e.key==='ArrowLeft')$('prevPage').click();});
  loadLibrary();
})();