(()=>{
const QA_LIKE_KEY='qatools_likes';
const QA_CART_KEY='qatools_cart';

function qaLikesSet(){
  return new Set(JSON.parse(localStorage.getItem(QA_LIKE_KEY)||'[]'));
}

function qaCartSet(){
  const purchased=new Set(window.QA_PURCHASED_IDS||[]);
  return new Set(
    JSON.parse(localStorage.getItem(QA_CART_KEY)||'[]')
      .filter(id=>!purchased.has(id))
  );
}

function qaSaveLikes(set){
  localStorage.setItem(QA_LIKE_KEY,JSON.stringify([...set]));
  window.dispatchEvent(new Event('qatools-likes-updated'));
}

function qaSaveCart(set){
  const purchased=new Set(window.QA_PURCHASED_IDS||[]);
  localStorage.setItem(
    QA_CART_KEY,
    JSON.stringify([...set].filter(id=>!purchased.has(id)))
  );
  window.dispatchEvent(new Event('qatools-cart-updated'));
}

function qaPaintLikeButtons(){
  const likes=qaLikesSet();

  document.querySelectorAll('[data-like]').forEach(btn=>{
    const liked=likes.has(btn.dataset.like);
    btn.textContent=liked?'♥':'♡';
    btn.classList.toggle('liked',liked);
  });

  const toolHeart=document.getElementById('sideHeart');
  if(toolHeart){
    const id=new URLSearchParams(location.search).get('id');
    const liked=likes.has(id);
    toolHeart.textContent=liked?'♥':'♡';
    toolHeart.classList.toggle('liked',liked);
  }

  const topToolHeart=document.getElementById('productHeart');
  if(topToolHeart){
    const id=new URLSearchParams(location.search).get('id');
    const liked=likes.has(id);
    topToolHeart.textContent=liked?'♥':'♡';
    topToolHeart.classList.toggle('liked',liked);
  }
}

function qaToggleLike(id){
  if(!id)return;
  const likes=qaLikesSet();
  likes.has(id)?likes.delete(id):likes.add(id);
  qaSaveLikes(likes);
  qaPaintLikeButtons();
}

function qaAnimateToCart(img){
  const cartIcon=document.getElementById('cartButton');
  if(!img||!cartIcon)return;

  const a=img.getBoundingClientRect();
  const b=cartIcon.getBoundingClientRect();

  const flyer=img.cloneNode();
  flyer.className='cart-flyer';
  Object.assign(flyer.style,{
    left:a.left+'px',
    top:a.top+'px',
    width:'100px',
    height:'72px'
  });

  document.body.appendChild(flyer);

  requestAnimationFrame(()=>{
    flyer.style.transform=`translate(${b.left-a.left}px,${b.top-a.top}px) scale(.12)`;
    flyer.style.opacity='0';
  });

  setTimeout(()=>flyer.remove(),520);
}

function qaToggleCart(id,img=null){
  const purchased=new Set(window.QA_PURCHASED_IDS||[]);
  if(!id||purchased.has(id))return;

  const cart=qaCartSet();
  const already=cart.has(id);

  if(already){
    cart.delete(id);
  }else{
    cart.add(id);
    qaAnimateToCart(img);
  }

  qaSaveCart(cart);
  qaPaintProductStates();
}

function qaPaintProductStates(){
  const purchased=new Set(window.QA_PURCHASED_IDS||[]);
  const cart=qaCartSet();

  document.querySelectorAll('[data-purchased-state]').forEach(el=>{
    el.classList.toggle('show',purchased.has(el.dataset.purchasedState));
  });

  document.querySelectorAll('[data-cart-state]').forEach(el=>{
    const id=el.dataset.cartState;
    el.classList.toggle('show',!purchased.has(id)&&cart.has(id));
  });

  document.querySelectorAll('[data-add-cart]').forEach(btn=>{
    const id=btn.dataset.addCart;
    btn.classList.remove('in-cart','purchased');

    if(purchased.has(id)){
      btn.disabled=true;
      btn.textContent='PURCHASED';
      btn.classList.add('purchased');
    }else if(cart.has(id)){
      btn.disabled=false;
      btn.textContent='IN CART';
      btn.classList.add('in-cart');
    }else{
      btn.disabled=false;
      btn.textContent='ADD TO CART';
    }
  });

  const toolBtn=document.getElementById('addToCartButton');
  if(toolBtn){
    const id=new URLSearchParams(location.search).get('id');
    toolBtn.classList.remove('in-cart','purchased');

    if(purchased.has(id)){
      toolBtn.disabled=true;
      toolBtn.textContent='PURCHASED';
      toolBtn.classList.add('purchased');
    }else if(cart.has(id)){
      toolBtn.disabled=false;
      toolBtn.textContent='IN CART';
      toolBtn.classList.add('in-cart');
    }else{
      toolBtn.disabled=false;
      toolBtn.textContent='ADD TO CART';
    }

    const purchasedIcon=document.getElementById('toolPurchased');
    const cartIcon=document.getElementById('toolCartState');
    purchasedIcon?.classList.toggle('show',purchased.has(id));
    cartIcon?.classList.toggle('show',!purchased.has(id)&&cart.has(id));
  }
}

function qaBindProductInteractions(){
  document.querySelectorAll('[data-like]').forEach(btn=>{
    if(btn.dataset.qaBound)return;
    btn.dataset.qaBound='1';

    btn.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();
      qaToggleLike(btn.dataset.like);
    });
  });

  const toolId=new URLSearchParams(location.search).get('id');

  [document.getElementById('sideHeart'),document.getElementById('productHeart')]
    .filter(Boolean)
    .forEach(btn=>{
      if(btn.dataset.qaBound)return;
      btn.dataset.qaBound='1';
      btn.addEventListener('click',e=>{
        e.preventDefault();
        e.stopPropagation();
        qaToggleLike(toolId);
      });
    });

  document.querySelectorAll('[data-add-cart]').forEach(btn=>{
    if(btn.dataset.qaBound)return;
    btn.dataset.qaBound='1';

    btn.addEventListener('click',e=>{
      e.preventDefault();
      e.stopPropagation();

      const id=btn.dataset.addCart;
      const img=btn.closest('.product-card')?.querySelector('img');
      qaToggleCart(id,img);
    });
  });

  const toolCartButton=document.getElementById('addToCartButton');
  if(toolCartButton && !toolCartButton.dataset.qaBound){
    toolCartButton.dataset.qaBound='1';

    toolCartButton.addEventListener('click',e=>{
      e.preventDefault();
      const img=document.getElementById('productImage');
      qaToggleCart(toolId,img);
    });
  }
}

window.addEventListener('qatools-likes-updated',qaPaintLikeButtons);
window.addEventListener('qatools-cart-updated',qaPaintProductStates);
window.addEventListener('storage',()=>{
  qaPaintLikeButtons();
  qaPaintProductStates();
});

document.addEventListener('DOMContentLoaded',()=>{
  qaBindProductInteractions();
  qaPaintLikeButtons();
  qaPaintProductStates();
});
})();
