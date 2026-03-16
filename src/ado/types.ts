export type AdoIteration = {
  id: number;
  description: string;
  createdDate: string;
};

export type AdoIterationChange = {
  changeTrackingId: number;
  changeType: "add" | "edit" | "rename" | "delete" | "all";
  item: {
    path: string;
  };
};

export type AdoPullRequest = {
  pullRequestId: number;
  title: string;
  description: string;
  sourceRefName: string;
  targetRefName: string;
  createdBy: {
    displayName: string;
  };
  workItemRefs?: {
    id: string;
  }[];
};

export type AdoThread = {
  id: number;
  status: string;
  threadContext?: {
    filePath: string;
    rightFileStart?: { line: number };
    rightFileEnd?: { line: number };
  };
  comments: AdoComment[];
  pullRequestThreadContext?: {
    changeTrackingId: number;
  };
};

export type AdoComment = {
  id: number;
  content: string;
  commentType: string;
  author: {
    displayName: string;
  };
};

export type AdoClient = {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
};
