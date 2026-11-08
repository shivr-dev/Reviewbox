let pending:{keyword:string;subject:string}|undefined;
export function requestCommunitySearch(value:{keyword:string;subject:string}){pending=value;window.dispatchEvent(new CustomEvent('review:community-search',{detail:value}));}
export function consumeCommunitySearch(){const value=pending;pending=undefined;return value;}
