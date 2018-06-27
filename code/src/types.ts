export interface IModule {
  dir: string;
  name: string;
  version: string;
  latest: string;
  isIgnored: boolean;
  isTypeScript: boolean;
  gitignore: string[];
  hasScripts: boolean;
  hasPrepublish: boolean;
  tsconfig?: any;
  dependencies: IDependency[];
  json: any;
  npm?: INpmInfo;
}

export interface IDependency {
  name: string;
  version: string;
  isDev: boolean;
  isLocal: boolean;
  package?: IModule;
}

export interface INpmInfo {
  name: string;
  latest: string;
  json: any;
}

export { ILogTable } from 'log.server';
