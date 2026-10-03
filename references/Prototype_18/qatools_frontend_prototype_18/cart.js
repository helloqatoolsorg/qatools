
(()=>{
  const CART_KEY='qatools_cart';
  const purchasedSet=new Set(window.QA_PURCHASED_IDS||[]);

  function readCart(){
    const raw=JSON.parse(localStorage.getItem(CART_KEY)||'[]');
    const clean=[...new Set(raw)].filter(id=>!purchasedSet.has(id));
    if(JSON.stringify(clean)!==JSON.stringify(raw)){
      localStorage.setItem(CART_KEY,JSON.stringify(clean));
    }
    return clean;
  }

  function writeCart(ids){
    const clean=[...new Set(ids)].filter(id=>!purchasedSet.has(id));
    localStorage.setItem(CART_KEY,JSON.stringify(clean));
  }

  function productById(id){
    return (window.QA_PRODUCTS||[]).find(p=>p.id===id);
  }

  function openCart(open){
    const drawer=document.getElementById('cartDrawer');
    const overlay=document.getElementById('cartOverlay');
    if(!drawer)return;

    drawer.classList.toggle('open',open);
    overlay?.classList.toggle('open',open);
    drawer.setAttribute('aria-hidden',open?'false':'true');
  }

  function renderCart(){
    const ids=readCart();
    const products=ids.map(productById).filter(Boolean);

    const button=document.getElementById('cartButton');
    const counter=document.getElementById('cartCount');
    const items=document.getElementById('cartItems');
    const empty=document.getElementById('cartEmpty');
    const drawerCount=document.getElementById('cartDrawerCount');
    const total=document.getElementById('cartTotal');
    const checkout=document.getElementById('checkoutButton');

    if(button) button.classList.toggle('cart-has-items',products.length>0);
    if(counter) counter.textContent=products.length?String(products.length):'';

    if(items){
      items.innerHTML='';
      products.forEach(product=>{
        const row=document.createElement('div');
        row.className='cart-row';
        row.innerHTML=`
          <img class="cart-thumb" src="assets/${product.image}" alt="${product.title}">
          <div class="cart-row-copy">
            <strong>${product.title}</strong>
            <span>${product.category} · ${product.complexity}</span>
          </div>
          <div class="cart-row-price">€${product.price}</div>
          <button class="cart-remove" aria-label="Remove ${product.title}">×</button>
        `;
        row.querySelector('.cart-remove').addEventListener('click',()=>{
          writeCart(readCart().filter(id=>id!==product.id));
          renderCart();
          window.dispatchEvent(new Event('qatools-cart-updated'));
        });
        items.appendChild(row);
      });
    }

    empty?.classList.toggle('show',products.length===0);
    if(drawerCount){
      drawerCount.textContent=products.length+(products.length===1?' product':' products');
    }
    if(total){
      total.textContent='€'+products.reduce((sum,p)=>sum+Number(p.price),0);
    }
    if(checkout) checkout.disabled=products.length===0;

    if(window.qaPaintTopShelf) window.qaPaintTopShelf();
  }

  function bindDrawer(){
    const button=document.getElementById('cartButton');
    const close=document.getElementById('cartClose');
    const overlay=document.getElementById('cartOverlay');

    if(button && !button.dataset.cartDrawerBound){
      button.dataset.cartDrawerBound='1';
      button.addEventListener('click',e=>{
        e.preventDefault();
        e.stopPropagation();
        const drawer=document.getElementById('cartDrawer');
        openCart(!drawer?.classList.contains('open'));
      });
    }

    if(close && !close.dataset.cartDrawerBound){
      close.dataset.cartDrawerBound='1';
      close.addEventListener('click',()=>openCart(false));
    }

    if(overlay && !overlay.dataset.cartDrawerBound){
      overlay.dataset.cartDrawerBound='1';
      overlay.addEventListener('click',()=>openCart(false));
    }
  }

  window.qaRenderCart=renderCart;
  window.qaOpenCart=openCart;

  window.addEventListener('qatools-cart-updated',()=>{
    bindDrawer();
    renderCart();
  });

  window.addEventListener('storage',renderCart);

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',()=>{
      bindDrawer();
      renderCart();
    });
  }else{
    bindDrawer();
    renderCart();
  }
})();
