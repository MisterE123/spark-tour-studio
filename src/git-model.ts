import type {Project,Hosting,Snapshot} from './model';
export interface GitAuthor {name:string;email:string}
export interface GitState {available:boolean;enabled:boolean;repository:boolean;executable?:string;version?:string;branch:string;author:GitAuthor;versions:{id:string;author:string;date:string;message:string}[];changes:{path:string;status:string;managed:boolean}[];remotes:{name:string;url:string;pushUrl:string}[]}
export interface WebsiteEstimate {bytes:number;limit:number;overPagesLimit:boolean;files:number;remoteCount:number;missing:string[];oversizedFiles:{path:string;bytes:number}[]}
export interface GitResult {snapshot:Snapshot;state:GitState;created:boolean}
export type PublicationMode='folder'|'local'|'github';
export interface PublicationResult {mode?:PublicationMode;destination?:string;repository:string;branch:string;url:string;commit?:string;status:string;error?:string}
export interface GithubState {available:boolean;authenticated:boolean;login:string;version?:string;error?:string;publication?:{mode:PublicationMode;destination:string;repository:string;branch:string;portable:boolean;omitSplats:boolean;last?:PublicationResult}}
export interface PublicationSettings {mode:PublicationMode;destination:string;repository:string;branch:string;portable:boolean;omitSplats:boolean}
export interface PublicationReview extends PublicationSettings {id:string;repositoryUrl:string;private:boolean;url:string;bytes:number;files:number;remoteAssets:number;title:string;commit:string;sourceCommit?:string|null;sourceModified?:boolean}
export interface GitBridge {
 getPublicationPreferences():Promise<NonNullable<GithubState['publication']>>;
 getGithubState():Promise<GithubState>;loginGithub():Promise<GithubState>;logoutGithub():Promise<GithubState>;cancelGithubLogin():Promise<void>;openGithubDevice():Promise<void>;copyGithubCode():Promise<void>;onGithubDevice(fn:(value:{code:string;url:string})=>void):()=>void;
 createGithubRepository(settings:{owner:string;name:string;visibility:'public'|'private'}):Promise<{repository:{name:string;url:string;private:boolean};state:GitState}>;pushGitVersions(remote:string):Promise<{commit:string;remote:string;branch:string}>;
 choosePublicationFolder():Promise<string|null>;openPublicationFolder(folder:string):Promise<void>;preparePublication(project:Project,hosting:Hosting,settings:PublicationSettings):Promise<PublicationReview>;publishWebsite(id:string):Promise<PublicationResult>;discardPublication(id:string):Promise<void>;publicationStatus(repository:string):Promise<PublicationResult>;
 getGitState():Promise<GitState>;chooseGit():Promise<GitState|null>;enableGit(author:GitAuthor):Promise<GitState>;disableGit():Promise<GitState>;setGitAuthor(author:GitAuthor):Promise<GitState>;
 saveVersion(project:Project,hosting:Hosting,message:string):Promise<GitResult>;restoreVersion(project:Project,hosting:Hosting,id:string):Promise<GitResult>;reviewVersion(id?:string):Promise<{summary:string;patch:string}>;
 setupGitRemote(remote:{name:string;url:string;replace:boolean}):Promise<GitState>;openGitHelper(kind:'github'|'gitlab'|'git'):Promise<void>;estimateWebsite(project:Project,hosting:Hosting,omitSplats?:boolean):Promise<WebsiteEstimate>;
}
