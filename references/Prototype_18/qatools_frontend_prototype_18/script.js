(()=>{

const LIKE_KEY='qatools_likes';
const FILTER_KEY='qatools_filters';
const SORT_KEY='qatools_sort_single';
const SEARCH_KEY='qatools_search';
const CART_KEY='qatools_cart';

let likes=new Set(JSON.parse(localStorage.getItem(LIKE_KEY)||'[]'));
let activeFilters=new Set(JSON.parse(localStorage.getItem(FILTER_KEY)||'[]'));
let activeSort=JSON.parse(localStorage.getItem(SORT_KEY)||'null');
let activeSearch=localStorage.getItem(SEARCH_KEY)||'';

const purchased=new Set(window.QA_PURCHASED_IDS||[]);
const sortTrigger=document.getElementById('sortTrigger');
const filterTrigger=document.getElementById('filterTrigger');
const sortMenu=document.getElementById('sortMenu');
const filterMenu=document.getElementById('filterMenu');
const grid=document.getElementById('productGrid');
const count=document.getElementById('productCount');
const cards=[...grid.querySelectorAll('.product-card')];
const filterChips=document.getElementById('activeFilterChips');
const sortChips=document.getElementById('activeSortChips');
const searchChipWrap=document.getElementById('activeSearchChip');
const searchWrap=document.getElementById('searchWrap');
const searchToggle=document.getElementById('searchToggle');
const searchShell=document.getElementById('searchShell');
const searchInput=document.getElementById('searchInput');
const searchClose=document.getElementById('searchClose');
const searchResults=document.getElementById('searchResults');

function save(){
  localStorage.setItem(LIKE_KEY,JSON.stringify([...likes]));
  localStorage.setItem(FILTER_KEY,JSON.stringify([...activeFilters]));
  localStorage.setItem(SORT_KEY,JSON.stringify(activeSort));
  localStorage.setItem(SEARCH_KEY,activeSearch);
}

function cartSet(){return new Set(JSON.parse(localStorage.getItem(CART_KEY)||'[]'))}

function paintStates(){ window.dispatchEvent(new Event('qatools-cart-updated')); }


function compareBy(rule,a,b){
  const dir=rule.dir==='asc'?1:-1;
  if(rule.key==='price') return (Number(a.dataset.price)-Number(b.dataset.price))*dir;
  if(rule.key==='date') return (new Date(a.dataset.date)-new Date(b.dataset.date))*dir;
  if(rule.key==='popularity') return (Number(a.dataset.popularity)-Number(b.dataset.popularity))*dir;
  if(rule.key==='relevance') return (Number(a.dataset.relevance)-Number(b.dataset.relevance))*dir;
  if(rule.key==='complexity'){
    const rank={SIMPLE:1,MEDIUM:2,COMPLEX:3};
    return (rank[a.dataset.complexity]-rank[b.dataset.complexity])*dir;
  }
  return 0;
}

function effectiveSort(){
  return activeSort || {key:'relevance',dir:'desc'};
}

function applySort(){
  const rule=effectiveSort();
  const sorted=[...cards].sort((a,b)=>{
    const c=compareBy(rule,a,b);
    if(c!==0)return c;
    return a.dataset.id.localeCompare(b.dataset.id);
  });
  sorted.forEach(card=>grid.appendChild(card));
  save();
}

function paintSort(){
  document.querySelectorAll('.sort-option').forEach(btn=>{
    const selected=activeSort && activeSort.key===btn.dataset.sort;
    btn.classList.toggle('selected',!!selected);
    const arrow=btn.querySelector('b');
    if(selected) arrow.textContent=activeSort.dir==='asc'?'↑':'↓';
  });

  sortChips.innerHTML='';

  // Relevance is intentionally invisible when it is only the background default.
  if(!activeSort) return;

  const group=document.createElement('div');
  group.className='sort-chip-group';

  const direction=document.createElement('button');
  direction.className='sort-chip-direction';
  direction.textContent=activeSort.dir==='asc'?'↑':'↓';
  direction.title='Change sorting direction';
  direction.addEventListener('click',()=>{
    activeSort.dir=activeSort.dir==='asc'?'desc':'asc';
    paintSort();
    applySort();
  });

  const name=document.createElement('button');
  name.className='sort-chip-name';
  name.innerHTML=`<span>${activeSort.key}</span><b>×</b>`;
  name.title='Remove sorting type';
  name.addEventListener('click',()=>{
    activeSort=null;
    paintSort();
    applySort();
  });

  group.append(direction,name);
  sortChips.appendChild(group);
}

function paintFilters(){
  document.querySelectorAll('.filter-option').forEach(btn=>btn.classList.toggle('selected',activeFilters.has(btn.dataset.filter)));
  filterChips.innerHTML='';
  [...activeFilters].forEach(value=>{
    const chip=document.createElement('button');
    chip.className='filter-chip';
    chip.innerHTML=`<span>${value}</span><b>×</b>`;
    chip.addEventListener('click',()=>{
      activeFilters.delete(value);save();paintFilters();applyVisibility();window.scrollTo(0,0);
    });
    filterChips.appendChild(chip);
  });
}
function normalize(s){return(s||'').toLowerCase().trim()}
function rankedMatches(query){
  const q=normalize(query); if(!q)return[];
  return cards.map(card=>{
    const n=normalize(card.dataset.id);
    const idx=n.indexOf(q);
    if(idx===-1)return null;
    return {card,front:idx===0?1:0,alpha:n};
  }).filter(Boolean).sort((a,b)=>b.front-a.front||a.alpha.localeCompare(b.alpha));
}
function paintSearchChip(){
  searchChipWrap.innerHTML='';
  if(!activeSearch)return;
  const chip=document.createElement('button');
  chip.className='filter-chip search-chip';
  chip.innerHTML=`<span>${activeSearch}</span><b>×</b>`;
  chip.addEventListener('click',()=>{activeSearch='';save();paintSearchChip();applyVisibility();window.scrollTo(0,0)});
  searchChipWrap.appendChild(chip);
}
function applyVisibility(){
  const matches=new Set(activeSearch?rankedMatches(activeSearch).map(x=>x.card.dataset.id):[]);
  let visible=0;
  cards.forEach(card=>{
    const filterMatch=activeFilters.size===0||activeFilters.has(card.dataset.category)||activeFilters.has(card.dataset.complexity);
    const searchMatch=!activeSearch||matches.has(card.dataset.id);
    const show=filterMatch&&searchMatch;
    card.classList.toggle('hidden-card',!show);
    if(show)visible++;
  });
  count.textContent=visible+(visible===1?' product':' products');
  applySort();paintStates();
}




function closeMenus(except=null){[sortMenu,filterMenu].forEach(m=>{if(m!==except)m.classList.remove('open')})}
sortTrigger.addEventListener('click',e=>{e.stopPropagation();sortMenu.classList.toggle('open');closeMenus(sortMenu)});
filterTrigger.addEventListener('click',e=>{e.stopPropagation();filterMenu.classList.toggle('open');closeMenus(filterMenu)});
document.addEventListener('click',()=>closeMenus());
document.querySelectorAll('.dropdown').forEach(d=>d.addEventListener('click',e=>e.stopPropagation()));

document.querySelectorAll('.sort-option').forEach(btn=>btn.addEventListener('click',()=>{
  const key=btn.dataset.sort;
  const defaults={popularity:'desc',price:'asc',complexity:'asc',relevance:'desc',date:'desc'};

  // Selecting any sort replaces the hidden default relevance.
  if(activeSort && activeSort.key===key){
    // Clicking the same menu option toggles its direction.
    activeSort.dir=activeSort.dir==='asc'?'desc':'asc';
  }else{
    activeSort={key,dir:defaults[key]};
  }

  paintSort();
  applySort();
  sortMenu.classList.remove('open');
}));

document.querySelectorAll('.filter-option').forEach(btn=>btn.addEventListener('click',()=>{
  const value=btn.dataset.filter;
  activeFilters.has(value)?activeFilters.delete(value):activeFilters.add(value);
  save();paintFilters();applyVisibility();
}));
document.querySelectorAll('[data-card-filter]').forEach(btn=>btn.addEventListener('click',e=>{
  e.preventDefault();e.stopPropagation();
  activeFilters=new Set([btn.dataset.cardFilter]);
  save();paintFilters();applyVisibility();window.scrollTo(0,0);
}));
document.getElementById('clearFilters').addEventListener('click',()=>{
  activeFilters.clear();save();paintFilters();applyVisibility();
});

function openSearch(){searchWrap.classList.add('open');searchShell.classList.add('open');setTimeout(()=>searchInput.focus(),120)}
function closeSearch(){searchWrap.classList.remove('open');searchShell.classList.remove('open');searchResults.classList.remove('open');searchInput.value=''}
searchToggle.addEventListener('click',e=>{e.stopPropagation();openSearch()});
searchClose.addEventListener('click',e=>{e.stopPropagation();closeSearch()});
let activeSuggestionIndex=-1;

function paintSuggestionSelection(){
  const rows=[...searchResults.querySelectorAll('.search-result')];
  rows.forEach((row,i)=>row.classList.toggle('keyboard-active',i===activeSuggestionIndex));
  if(activeSuggestionIndex>=0 && rows[activeSuggestionIndex]){
    rows[activeSuggestionIndex].scrollIntoView({block:'nearest'});
  }
}

function renderSuggestions(){
  const q=searchInput.value.trim();
  searchResults.innerHTML='';
  activeSuggestionIndex=-1;
  if(!q){searchResults.classList.remove('open');return}

  rankedMatches(q).forEach(({card})=>{
    const p=(window.QA_PRODUCTS||[]).find(x=>x.id===card.dataset.id);
    const row=document.createElement('button');
    row.className='search-result';
    row.dataset.productId=p.id;
    row.innerHTML=`<span>${p.title}</span><small>${p.category} · ${p.complexity}</small>`;
    row.addEventListener('click',()=>location.href=`product.html?id=${encodeURIComponent(p.id)}`);
    searchResults.appendChild(row);
  });
  searchResults.classList.toggle('open',searchResults.children.length>0);
}

searchInput.addEventListener('input',renderSuggestions);
searchInput.addEventListener('keydown',e=>{
  const rows=[...searchResults.querySelectorAll('.search-result')];

  if(e.key==='ArrowDown'){
    if(!rows.length)return;
    e.preventDefault();
    activeSuggestionIndex=(activeSuggestionIndex+1)%rows.length;
    paintSuggestionSelection();
    return;
  }

  if(e.key==='ArrowUp'){
    if(!rows.length)return;
    e.preventDefault();
    activeSuggestionIndex=activeSuggestionIndex<=0?rows.length-1:activeSuggestionIndex-1;
    paintSuggestionSelection();
    return;
  }

  if(e.key==='Enter'){
    e.preventDefault();

    if(activeSuggestionIndex>=0 && rows[activeSuggestionIndex]){
      const id=rows[activeSuggestionIndex].dataset.productId;
      location.href=`product.html?id=${encodeURIComponent(id)}`;
      return;
    }

    const q=searchInput.value.trim();
    if(!q)return;
    activeSearch=q;
    save();
    paintSearchChip();
    applyVisibility();
    closeSearch();
    window.scrollTo(0,0);
    return;
  }

  if(e.key==='Escape')closeSearch();
});
document.addEventListener('click',e=>{if(!searchWrap.contains(e.target))closeSearch()});

const params=new URLSearchParams(location.search);
const incoming=params.get('filter');
if(incoming){activeFilters=new Set([incoming.trim()]);save()}

// Logo clears filters/search, preserves sort, lands top.
document.querySelector('.brand')?.addEventListener('click',()=>{
  activeFilters.clear();activeSearch='';save();
});

paintSort();paintFilters();paintSearchChip();applyVisibility();
})();
