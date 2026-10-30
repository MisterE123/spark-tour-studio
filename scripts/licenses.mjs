import fs from 'node:fs/promises';import path from 'node:path';
await fs.mkdir('dist/licenses',{recursive:true});const list=[];const bundledPackages=new Set();const queue=['selfsigned','qrcode','@tiptap/react','@tiptap/pm','@tiptap/starter-kit','@tiptap/extension-image','@tiptap/extension-text-align'];while(queue.length){const name=queue.pop();if(bundledPackages.has(name))continue;bundledPackages.add(name);const pkg=JSON.parse(await fs.readFile(path.join('node_modules',name,'package.json'),'utf8'));queue.push(...Object.keys(pkg.dependencies||{}));}
await fs.copyFile('licenses/Google-Material-Symbols-LICENSE.txt','dist/licenses/Google-Material-Symbols-LICENSE.txt');
await fs.copyFile('LICENSE','dist/licenses/3DGS-Perspectives-Studio-LICENSE.txt');await fs.copyFile('THIRD_PARTY.md','dist/licenses/THIRD_PARTY.md');
await fs.copyFile('licenses/Node-LICENSE.txt','dist/licenses/Node-LICENSE.txt');
// The SOGS loader is adapted example code, independently of the published
// renderer. Preserve its full upstream permission notice, not just an SPDX tag.
const radixRoot='src/rendering/radix',radix=JSON.parse(await fs.readFile(radixRoot+'/vendor/PROVENANCE.json','utf8'));
await fs.copyFile(radixRoot+'/vendor/LICENSE','dist/licenses/Radix-LICENSE.txt');
await fs.copyFile(radixRoot+'/vendor/PROVENANCE.json','dist/licenses/Radix-PROVENANCE.json');
await fs.copyFile(radixRoot+'/README.md','dist/licenses/Radix-SOGS-ADAPTER.md');
list.push({name:radix.name,version:radix.version,license:radix.license,copyright:radix.copyright,commit:radix.packageCommit,notice:'Radix-LICENSE.txt'});
list.push({name:'World Labs Radix SOGS LoD example adapter',license:'MIT',copyright:radix.copyright,commit:radix.exampleCommit,source:radix.repository+'/tree/'+radix.exampleCommit+'/examples/sogs',notice:'Radix-LICENSE.txt',modifications:'Radix-SOGS-ADAPTER.md',provenance:'Radix-PROVENANCE.json'});
for(const name of new Set(['@sparkjsdev/spark','three','@dimforge/rapier3d-compat','react','react-dom','zod','fflate','recast-navigation','@recast-navigation/core','@recast-navigation/generators','@recast-navigation/wasm',...bundledPackages])){const root=path.join('node_modules',name);const pkg=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8'));let text='';for(const file of await fs.readdir(root)){if(/^licen[sc]e|^copying|^notice/i.test(file)){const stat=await fs.stat(path.join(root,file));if(stat.isFile())text+=await fs.readFile(path.join(root,file),'utf8')+'\n';}}if(!text)text=`License identifier: ${pkg.license}. See ${pkg.repository?.url||pkg.homepage||name}.`;const target=name.replaceAll('/','_')+'.txt';await fs.writeFile(path.join('dist/licenses',target),`${name} ${pkg.version}\n\n${text}`);list.push({name,version:pkg.version,license:pkg.license});}
await fs.writeFile('dist/licenses/dependencies.json',JSON.stringify(list,null,2));

await fs.cp('specs/performance','dist/performance-spec',{recursive:true});
