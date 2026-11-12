// The standalone preview persists blobs; authenticated production uses its existing private API.
const DATABASE='drix-creations-v1', STORE='clips';
async function openDatabase() {
  return new Promise((resolve,reject)=>{
    if(typeof indexedDB==='undefined'){reject(new Error('No se pudieron guardar tus creaciones.'));return;}
    const request=indexedDB.open(DATABASE,1);let expired=false;
    const timer=setTimeout(()=>{expired=true;reject(new Error('No se pudieron abrir tus creaciones.'));},10000);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'id'});};
    request.onsuccess=()=>{clearTimeout(timer);if(expired)request.result.close();else resolve(request.result);};
    request.onerror=request.onblocked=()=>{clearTimeout(timer);reject(new Error('No se pudieron abrir tus creaciones.'));};
  });
}
async function transact(mode,fn){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,mode);let result;try{result=fn(tx.objectStore(STORE));}catch(e){db.close();reject(e);return;}tx.oncomplete=()=>{db.close();resolve(typeof result==='function'?result():result);};tx.onerror=tx.onabort=()=>{db.close();reject(new Error('No se pudieron guardar los cambios.'));};});}
export async function saveCreation(record){await transact('readwrite',store=>{store.put(record);});}
export async function removeCreation(id){await transact('readwrite',store=>{store.delete(id);});}
export async function listCreations(){return transact('readwrite',store=>{let records=[];const request=store.getAll();request.onsuccess=()=>{records=request.result.filter(record=>{if(record.expiresAt<=Date.now()){store.delete(record.id);return false;}return true;}).sort((a,b)=>b.createdAt-a.createdAt);};return()=>records;});}
