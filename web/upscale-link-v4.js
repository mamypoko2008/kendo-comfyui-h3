/* V4 ingress: source descriptors travel directly from completed video cards. */
(() => {
  function linkFor(url) {
    const media = new URL(url, location.origin);
    const query = new URLSearchParams();
    for (const name of ['filename','subfolder','type']) query.set(name,media.searchParams.get(name)|| (name==='type'?'output':''));
    return '/upscale.html?' + query;
  }
  function update() {
    for (const article of document.querySelectorAll('#history article')) {
      const video=article.querySelector('video'), actions=article.querySelector('.history-actions');
      if (!video?.getAttribute('src') || !actions) continue;
      let link=actions.querySelector('.upscale-link');
      if(!link){link=document.createElement('a');link.className='upscale-link';link.textContent='อัพสเกล';actions.append(link);}
      link.href=linkFor(video.getAttribute('src'));
    }
    const video=document.querySelector('#preview video'), download=document.querySelector('#download');
    if(!download)return;
    let link=document.querySelector('#latest-upscale');
    if(!link){link=document.createElement('a');link.id='latest-upscale';link.className='upscale-link';link.textContent='อัพสเกล';download.after(link);}
    link.hidden=!video;
    if(video)link.href=linkFor(video.getAttribute('src'));
  }
  new MutationObserver(update).observe(document.querySelector('.content'),{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  update();
})();
