import React from 'react';
import {IconButton,InspectorSection} from './icons';
import {ControlsHelp} from './ui';
import {appVersion} from './version';

export type HelpTopic='controls'|'distribution'|'about';
export function EditorHelp({topic,onClose}:{topic:HelpTopic;onClose:()=>void}){
 const title=topic==='distribution'?'Distribute your tour':topic==='about'?'About Spark Tour Studio':'Controls help';
 return <div className="modal-shade"><section className={'dialog '+(topic==='distribution'?'distribution-guide':'')} role="dialog" aria-modal="true" aria-label={title}>
  <header><h2>{title}</h2><IconButton icon="close" label="Close help" onClick={onClose}/></header>
  {topic==='controls'?<ControlsHelp/>:topic==='distribution'?<>
   <p>Export first, then share the resulting folder. It contains the website, your tour data, bundled application code and <strong>Launch Tour.exe</strong>.</p>
   <InspectorSection title="Run on Windows" icon="folder_open" defaultOpen>
    <ol><li>Copy or unzip the <strong>whole exported folder</strong> to the visitor’s computer.</li><li>Run <strong>Launch Tour.exe</strong> inside that folder. It starts a local server and opens the tour in the default browser. Visitors do not need Node.js or Spark Tour Studio.</li><li>Keep the launcher running while exploring. Use <strong>Stop tour server</strong> in its control tab when finished.</li></ol>
    <p>Choose Portable export to include assets for offline viewing. Referenced-assets exports still need access to their remote files. Open the tour through the launcher rather than double-clicking index.html.</p>
   </InspectorSection>
   <InspectorSection title="Host a website" icon="ios_share" defaultOpen>
    <ol><li>Upload the exported website folders and files to a static <strong>HTTPS</strong> host. The EXE is for Windows viewing and does not need to be uploaded.</li><li>Preserve the folder structure, including <strong>config/</strong>, <strong>assets/</strong>, <strong>pages/</strong> and <strong>licenses/</strong>. Open the site’s index.html address; hosting inside a subfolder works.</li><li>Configure the host to serve RAD files with byte ranges (<strong>206 Partial Content</strong>). Asset URLs must return actual files, including missing-file errors, rather than redirecting every request to index.html.</li></ol>
    <p>HTTPS is required for WebXR away from localhost. Test the published site on desktop and in Quest Browser before sharing its link.</p>
   </InspectorSection>
   <InspectorSection title="Put splats on a separate host or CDN" icon="image_arrow_up" defaultOpen>
    <ol><li>Find each scene’s <strong>source</strong> in the exported <strong>config/tour.json</strong>. Upload those RAD files and every companion RADC chunk, preserving their relative folders and chunk names. Include Gaussian splat backgrounds too.</li><li>Edit the exported <strong>config/hosting.json</strong>. Set <strong>assetBaseUrl</strong> to the asset-host folder, ending with a slash. Relative splat sources resolve below it. Use <strong>sceneUrls</strong> for individual scenes, including sources that already have an absolute URL.</li><li>Enable <strong>CORS</strong> for your website’s origin on the asset host, as well as HTTPS and byte-range responses for every chunk. Visit the site and verify streaming before removing local copies.</li></ol>
    <pre aria-label="Hosting configuration example">{JSON.stringify({assetBaseUrl:'https://cdn.example.com/my-tour/',sceneUrls:{'scene-id':'https://other.example.com/interior.rad'}},null,2)}</pre>
    <p>Replace “scene-id” with the scene’s stable id, or use an empty sceneUrls object when one base URL covers every relative splat. Application code, images, audio and collision meshes keep their own paths; the splat base URL does not move them.</p>
    <p>Use Referenced-assets export and <strong>omit local splats</strong> when uploading them separately. Configuration changes need no JavaScript rebuild. Restore assetBaseUrl to <strong>./</strong> and remove overrides to use bundled relative splat files.</p>
   </InspectorSection>
   <InspectorSection title="Share with Quest or devices on your network" icon="head_mounted_device">
    <ol><li>Run Launch Tour.exe, open its control tab and choose <strong>Share on this network</strong>.</li><li>Select the Wi-Fi or Ethernet address. On another device on the same network, scan the QR code or enter the displayed HTTPS address.</li><li>The local certificate may show a browser warning. Check the address against the launcher before continuing. If needed, allow the launcher through Windows Firewall on your private network.</li><li>In Quest Browser, enter the tour and select <strong>Enter VR</strong>. Use Stop sharing or Stop tour server in the launcher when finished.</li></ol>
    <p>Guest Wi-Fi isolation can prevent devices from connecting. This shares the tour on your local network; use a website host for an Internet link.</p>
   </InspectorSection>
  </>:<p>MIT licensed. Google Material Symbols are included under Apache 2.0. Runtime dependencies and their license notices are bundled with the application and exports.</p>}
  <hr/><small className="muted">Spark Tour Studio · Version {appVersion}</small>
 </section></div>;
}
