interface Window { zhiye?: { configureRepositories(urls:string[]):Promise<void>; githubRequest(path:string,method:string,body:string):Promise<{content:{sha:string};[key:string]:unknown}> } }
