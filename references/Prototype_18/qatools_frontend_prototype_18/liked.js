(()=>{

const LIKE_KEY='qatools_likes';
const likes=new Set(JSON.parse(localStorage.getItem(LIKE_KEY)||'[]'));
const cards=[...document.querySelectorAll('.product-card')];
const empty=document.getElementById('emptyLikedPage');

function paint(){
  let visible=0;
  cards.forEach(card=>{
    const likes=new Set(JSON.parse(localStorage.getItem(LIKE_KEY)||'[]')); const show=likes.has(card.dataset.id);
    card.style.display=show?'block':'none';
    if(show) visible++;
    const h=card.querySelector('[data-like]');
    if(h){h.textContent='♥';h.classList.add('liked')}
  });
  empty.style.display=visible?'none':'block';
}


paint();
})();
