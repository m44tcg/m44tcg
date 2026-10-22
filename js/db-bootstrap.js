/* Banco embutido: se M44_DB estiver preenchido, nada é baixado da internet (exceto as imagens). */
(function(){const D=window.M44_DB;if(!D||!D.cards||!D.cards.length)return;
  const sets=new Map(D.sets.map(x=>[x.id,x])),img=(a,n)=>`https://images.pokemontcg.io/${a}/${n}`;
  window.M44_SETS_DB=D.sets;window.M44_BY_SET={};
  window.m44ApiCard=r=>{const x=sets.get(r[3])||{};return{id:r[0],name:r[1],number:r[2],rarity:r[4],set:{id:r[3],name:x.name||'',printedTotal:x.printedTotal,total:x.total},images:{small:r[5]||img(r[3],r[2]+'.png'),large:r[6]||img(r[3],r[2]+'_hires.png')}}};
  D.cards.forEach(r=>(window.M44_BY_SET[r[3]]=window.M44_BY_SET[r[3]]||[]).push(r));
})();
