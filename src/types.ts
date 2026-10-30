export interface GithubBinding {
  transport?: 'file' | 'manifest';
  baseSnapshot?: string; baseContent?: string; url: string; branch: string; path: string; sha: string; format: 'md' | 'html'; syncedAt: string;
}
export interface SourceBinding { commit?: string; url: string; branch: string; path: string; sha: string; baseContent: string; missing?: boolean }
export interface Note {
  syncMode?: 'reference' | 'full';
  visibility?: 'public' | 'private';
  publications?: {url:string;branch:string;path:string}[];
  source?: SourceBinding;
  folderPath?: string[];
  github?: GithubBinding;
  sourceUrl?: string;
  importFolderKey?: string;
  id: string;
  title: string;
  content: string;
  folderId: string | null;
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface Folder {
  parentId?: string | null;
  sourceKey?: string;
  id: string;
  name: string;
  createdAt: string;
}

export interface Asset {
  id: string;
  name: string;
  mime: string;
  size: number;
  dataUrl: string;
  createdAt: string;
}

export interface Workspace {
  ignoredSources?: string[];
  schemaVersion: 1;
  id: string;
  notes: Note[];
  folders: Folder[];
  assets: Asset[];
  updatedAt: string;
  lastBackupAt: string | null;
}

export type SaveStatus = 'loading' | 'saving' | 'saved' | 'error' | 'conflict';
export type ViewMode = 'split' | 'edit' | 'preview' | 'rich';
export type Filter = { kind: 'all' } | { kind: 'pinned' } | { kind: 'trash' } | { kind: 'unfiled' } | { kind: 'folder'; id: string } | { kind: 'tag'; id: string };
export type NoteSort = 'updated' | 'created' | 'titleAsc' | 'titleDesc';
