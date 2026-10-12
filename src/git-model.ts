import type {Project,Hosting,Snapshot} from './model';
export interface GitAuthor {name:string;email:string}
export interface GitState {available:boolean;enabled:boolean;repository:boolean;executable?:string;version?:string;branch:string;author:GitAuthor;versions:{id:string;author:string;date:string;message:string}[];changes:{path:string;status:string;managed:boolean}[];remotes:{name:string;url:string;pushUrl:string}[]}
export interface WebsiteEstimate {bytes:number;limit:number;overPagesLimit:boolean;files:number;remoteCount:number;missing:string[];oversizedFiles:{path:string;bytes:number}[]}
export interface GitResult {snapshot:Snapshot;state:GitState;created:boolean}
export interface GitBridge {
 getGitState():Promise<GitState>;chooseGit():Promise<GitState|null>;enableGit(author:GitAuthor):Promise<GitState>;disableGit():Promise<GitState>;setGitAuthor(author:GitAuthor):Promise<GitState>;
 saveVersion(project:Project,hosting:Hosting,message:string):Promise<GitResult>;restoreVersion(project:Project,hosting:Hosting,id:string):Promise<GitResult>;reviewVersion(id?:string):Promise<{summary:string;patch:string}>;
 setupGitRemote(remote:{name:string;url:string;replace:boolean}):Promise<GitState>;openGitHelper(kind:'github'|'gitlab'|'git'):Promise<void>;estimateWebsite(project:Project,hosting:Hosting,omitSplats?:boolean):Promise<WebsiteEstimate>;
}
