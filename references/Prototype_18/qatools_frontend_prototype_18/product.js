
const params=new URLSearchParams(location.search);
const id=params.get('id')||'qafit01';
const p=(window.QA_PRODUCTS||[]).find(x=>x.id===id)||window.QA_PRODUCTS[0];

document.title=p.title+' — QA Tools';
document.getElementById('productImage').src='assets/'+p.image;
document.getElementById('productImage').alt=p.title+' preview';
document.getElementById('productTitle').textContent=p.title;
document.getElementById('productSubtitle').textContent=p.subtitle;
document.getElementById('productDescription').textContent=p.description;

// Only category + complexity remain as interactive tags.
const meta=document.getElementById('productMeta');
meta.innerHTML=`
  <a class="meta-filter" href="index.html?filter=${encodeURIComponent(p.category)}">${p.category}</a>
  <a class="meta-filter" href="index.html?filter=${encodeURIComponent(p.complexity)}">${p.complexity}</a>
`;

document.getElementById('productPrice').textContent='€'+p.price;
document.getElementById('footerMeta').textContent=`${p.title} / ${p.category} / ${p.complexity}`;
document.getElementById('infoCompatibility').textContent=p.compatibility;
document.getElementById('infoVersion').textContent=p.version;
document.getElementById('infoReleaseDate').textContent=p.date;
document.getElementById('infoUpdateDate').textContent=p.update_date;

const complexSection=document.getElementById('complexSection');
if(p.complexity==='COMPLEX'){
  complexSection.classList.add('show');
  document.getElementById('complexText').textContent=p.description+' Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus varius, nunc at vulputate gravida, nibh magna posuere sapien, non egestas justo arcu in lorem.';
  document.getElementById('secondaryImage').src='assets/'+p.image;
}else{
  complexSection.remove();
}

const LIKE_KEY='qatools_likes';
let likes=new Set(JSON.parse(localStorage.getItem(LIKE_KEY)||'[]'));
const hearts=[document.getElementById('productHeart'),document.getElementById('sideHeart')];
function paint(){
  const liked=likes.has(p.id);
  hearts.forEach(h=>{h.textContent=liked?'♥':'♡';h.classList.toggle('liked',liked)});
}
hearts.forEach(h=>h.addEventListener('click',()=>{
  likes.has(p.id)?likes.delete(p.id):likes.add(p.id);
  localStorage.setItem(LIKE_KEY,JSON.stringify([...likes]));
  paint();
  window.dispatchEvent(new Event('qatools-likes-updated'));
}));
paint();



const purchasedSet=new Set(window.QA_PURCHASED_IDS||[]);
function toolCartSet(){return new Set(JSON.parse(localStorage.getItem('qatools_cart')||'[]'))}
function paintToolStates(){
  const owned=purchasedSet.has(p.id);
  const inCart=!owned&&toolCartSet().has(p.id);
  document.getElementById('toolPurchased')?.classList.toggle('show',owned);
  document.getElementById('toolCartState')?.classList.toggle('show',inCart);
  if(addBtn){
    addBtn.disabled=owned||inCart;
    addBtn.textContent=owned?'PURCHASED':inCart?'IN CART':'ADD TO CART';
  }
}
window.addEventListener('qatools-cart-updated',paintToolStates);
paintToolStates();


const addBtn=document.getElementById('addToCartButton');

function toolCartSet(){
  return new Set(JSON.parse(localStorage.getItem('qatools_cart')||'[]'));
}

function animateToolToCart(){
  const img=document.getElementById('productImage');
  const cartIcon=document.getElementById('cartButton');
  if(!img||!cartIcon)return;

  const a=img.getBoundingClientRect();
  const b=cartIcon.getBoundingClientRect();
  const flyer=img.cloneNode();
  flyer.className='cart-flyer';
  Object.assign(flyer.style,{
    left:a.left+'px',
    top:a.top+'px',
    width:'120px',
    height:'86px'
  });
  document.body.appendChild(flyer);

  requestAnimationFrame(()=>{
    flyer.style.transform=`translate(${b.left-a.left}px,${b.top-a.top}px) scale(.12)`;
    flyer.style.opacity='0';
  });
  setTimeout(()=>flyer.remove(),520);
}

if(addBtn){
  addBtn.addEventListener('click',()=>{
    const purchasedSet=new Set(window.QA_PURCHASED_IDS||[]);
    if(purchasedSet.has(p.id))return;

    const cart=[...toolCartSet()];
    if(!cart.includes(p.id)){
      cart.push(p.id);
      localStorage.setItem('qatools_cart',JSON.stringify(cart));
      animateToolToCart();
      window.dispatchEvent(new Event('qatools-cart-updated'));
    }
  });
}
