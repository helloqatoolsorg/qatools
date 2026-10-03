
(()=>{
  const CART_KEY='qatools_cart';
  const purchased=new Set(window.QA_PURCHASED_IDS||[]);

  function readCart(){
    const raw=JSON.parse(localStorage.getItem(CART_KEY)||'[]');
    return [...new Set(raw)].filter(id=>!purchased.has(id));
  }

  function writeCart(ids){
    localStorage.setItem(
      CART_KEY,
      JSON.stringify([...new Set(ids)].filter(id=>!purchased.has(id)))
    );
  }

  function productById(id){
    return (window.QA_PRODUCTS||[]).find(p=>p.id===id);
  }

  function removeItem(id){
    writeCart(readCart().filter(x=>x!==id));
    render();
    window.dispatchEvent(new Event('qatools-cart-updated'));
  }

  function render(){
    const ids=readCart();
    const products=ids.map(productById).filter(Boolean);

    const list=document.getElementById('cartPageList');
    const empty=document.getElementById('cartPageEmpty');
    const count=document.getElementById('cartPageCount');
    const itemCount=document.getElementById('cartPageItemCount');
    const subtotal=document.getElementById('cartPageSubtotal');
    const total=document.getElementById('cartPageTotal');
    const checkout=document.getElementById('cartPageCheckout');

    let amount=0;
    list.innerHTML='';

    products.forEach(product=>{
      amount+=Number(product.price);

      const row=document.createElement('article');
      row.className='cart-page-item';

      row.innerHTML=`
        <a class="cart-page-item-main" href="product.html?id=${encodeURIComponent(product.id)}">
          <img src="assets/${product.image}" alt="${product.title}">
          <div class="cart-page-item-title">
            <strong>${product.title}</strong>
            <span>${product.subtitle}</span>
          </div>
        </a>

        <div class="cart-page-item-details">
          <div><span>category</span><strong>${product.category}</strong></div>
          <div><span>complexity</span><strong>${product.complexity}</strong></div>
          <div><span>compatibility</span><strong>${product.compatibility||'H21'}</strong></div>
          <div><span>version</span><strong>${product.version||'v1.0'}</strong></div>
        </div>

        <div class="cart-page-item-price">€${product.price}</div>

        <button class="cart-page-remove" aria-label="Remove ${product.title}">
          REMOVE
        </button>
      `;

      row.querySelector('.cart-page-remove').addEventListener('click',()=>{
        removeItem(product.id);
      });

      list.appendChild(row);
    });

    const n=products.length;
    count.textContent=n+(n===1?' product':' products');
    itemCount.textContent=String(n);
    subtotal.textContent='€'+amount;
    total.textContent='€'+amount;

    empty.classList.toggle('show',n===0);
    checkout.disabled=n===0;
  }

  window.addEventListener('storage',render);
  window.addEventListener('qatools-cart-updated',render);

  if(document.readyState==='loading'){
    document.addEventListener('DOMContentLoaded',render);
  }else{
    render();
  }
})();
