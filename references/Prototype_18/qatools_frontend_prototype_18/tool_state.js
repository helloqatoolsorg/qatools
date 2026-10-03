(()=>{

const QA_LIKE_KEY='qatools_likes';
const QA_CART_KEY='qatools_cart';
const params=new URLSearchParams(location.search);
const itemId=params.get('id')||'qafit01';
const item=(window.QA_PRODUCTS||[]).find(p=>p.id===itemId)||window.QA_PRODUCTS[0];
const purchased=new Set(window.QA_PURCHASED_IDS||[]);

function readLikes(){
  return new Set(JSON.parse(localStorage.getItem(QA_LIKE_KEY)||'[]'));
}
function saveLikes(set){
  localStorage.setItem(QA_LIKE_KEY,JSON.stringify([...set]));
  window.dispatchEvent(new Event('qatools-likes-updated'));
}
function readCart(){
  return new Set(JSON.parse(localStorage.getItem(QA_CART_KEY)||'[]').filter(id=>!purchased.has(id)));
}
function saveCart(set){
  localStorage.setItem(QA_CART_KEY,JSON.stringify([...set]));
  window.dispatchEvent(new Event('qatools-cart-updated'));
}

function renderTool(){
  document.title=item.title+' — QA Tools';
  document.getElementById('productImage').src='assets/'+item.image;
  document.getElementById('productImage').alt=item.title+' preview';
  document.getElementById('productTitle').textContent=item.title;
  document.getElementById('productSubtitle').textContent=item.subtitle;
  document.getElementById('productDescription').textContent=item.description;

  const meta=document.getElementById('productMeta');
  meta.innerHTML=`
    <a class="meta-filter" href="index.html?filter=${encodeURIComponent(item.category)}">${item.category}</a>
    <a class="meta-filter" href="index.html?filter=${encodeURIComponent(item.complexity)}">${item.complexity}</a>
  `;

  document.getElementById('productPrice').textContent='€'+item.price;
  document.getElementById('footerMeta').textContent=`${item.title} / ${item.category} / ${item.complexity}`;

  const map = {
    infoCompatibility:item.compatibility||'H21',
    infoVersion:item.version||'v1.0',
    infoReleaseDate:item.date||'',
    infoUpdateDate:item.update_date||item.date||''
  };
  for(const [id,value] of Object.entries(map)){
    const el=document.getElementById(id);
    if(el) el.textContent=value;
  }

  const complex=document.getElementById('complexSection');
  if(complex){
    if(item.complexity==='COMPLEX'){
      complex.classList.add('show');
      const txt=document.getElementById('complexText');
      const img=document.getElementById('secondaryImage');
      if(txt) txt.textContent=item.description+' Lorem ipsum dolor sit amet, consectetur adipiscing elit. Vivamus varius, nunc at vulputate gravida.';
      if(img) img.src='assets/'+item.image;
    }else{
      complex.remove();
    }
  }
}

function paintToolState(){
  const likes=readLikes();
  const cart=readCart();

  const liked=likes.has(itemId);
  const owned=purchased.has(itemId);
  const inCart=!owned && cart.has(itemId);

  const heart=document.getElementById('toolHeart');
  if(heart){
    heart.textContent=liked?'♥':'♡';
    heart.classList.toggle('liked',liked);
  }

  document.getElementById('toolPurchased')?.classList.toggle('show',owned);
  document.getElementById('toolCartState')?.classList.toggle('show',inCart);

  const btn=document.getElementById('toolAddToCart');
  if(btn){
    btn.classList.remove('in-cart','purchased');
    if(owned){
      btn.disabled=true;
      btn.textContent='PURCHASED';
      btn.classList.add('purchased');
    }else if(inCart){
      btn.disabled=false;
      btn.textContent='IN CART';
      btn.classList.add('in-cart');
    }else{
      btn.disabled=false;
      btn.textContent='ADD TO CART';
    }
  }
}

function animateToCart(){
  const img=document.getElementById('productImage');
  const cartIcon=document.getElementById('cartButton');
  if(!img||!cartIcon)return;
  const a=img.getBoundingClientRect(), b=cartIcon.getBoundingClientRect();
  const flyer=img.cloneNode();
  flyer.className='cart-flyer';
  Object.assign(flyer.style,{left:a.left+'px',top:a.top+'px',width:'110px',height:'78px'});
  document.body.appendChild(flyer);
  requestAnimationFrame(()=>{
    flyer.style.transform=`translate(${b.left-a.left}px,${b.top-a.top}px) scale(.12)`;
    flyer.style.opacity='0';
  });
  setTimeout(()=>flyer.remove(),520);
}

document.addEventListener('DOMContentLoaded',()=>{
  renderTool();
  paintToolState();

  document.getElementById('toolHeart')?.addEventListener('click',()=>{
    const likes=readLikes();
    likes.has(itemId)?likes.delete(itemId):likes.add(itemId);
    saveLikes(likes);
    paintToolState();
  });

  document.getElementById('toolAddToCart')?.addEventListener('click',()=>{
    if(purchased.has(itemId))return;
    const cart=readCart();
    if(cart.has(itemId)){
      cart.delete(itemId);
    }else{
      cart.add(itemId);
      animateToCart();
    }
    saveCart(cart);
    paintToolState();
  });
});

window.addEventListener('storage',paintToolState);
window.addEventListener('qatools-likes-updated',paintToolState);
window.addEventListener('qatools-cart-updated',paintToolState);
})();
