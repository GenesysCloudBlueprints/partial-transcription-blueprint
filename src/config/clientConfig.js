export const clientConfig = {
    clientId: process.env.REACT_APP_CLIENT_ID || '<YOUR CLIENT ID HERE>',
    redirectUri: process.env.REACT_APP_REDIRECT_URI || 'http://localhost:3000',
    gcEnvironment: process.env.REACT_APP_GC_ENVIRONMENT || 'mypurecloud.com',
}