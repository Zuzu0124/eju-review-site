const {defineConfig}=require('@playwright/test');
module.exports=defineConfig({
 testDir:'./tests/browser',fullyParallel:true,
 use:{baseURL:'http://127.0.0.1:4173',locale:'zh-CN',timezoneId:'Asia/Tokyo',trace:'retain-on-failure',screenshot:'only-on-failure'},
 webServer:{command:'node scripts/serve.cjs',url:'http://127.0.0.1:4173',reuseExistingServer:false},
 projects:[
   {name:'chromium-390-light',use:{browserName:'chromium',viewport:{width:390,height:844},colorScheme:'light',hasTouch:true}},
   {name:'chromium-320-dark-reduced',use:{browserName:'chromium',viewport:{width:320,height:568},colorScheme:'dark',reducedMotion:'reduce',hasTouch:true}},
   {name:'webkit-390-dark',use:{browserName:'webkit',viewport:{width:390,height:844},colorScheme:'dark',isMobile:true,hasTouch:true}},
   {name:'chromium-desktop',use:{browserName:'chromium',viewport:{width:1280,height:900},colorScheme:'light'}}
 ]
});
