(() => {
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const container = document.getElementById('gameContainer');
let W, H;
function resize() { W = canvas.width = container.clientWidth; H = canvas.height = container.clientHeight; }
resize(); window.addEventListener('resize', resize);

// ── Sound Engine (Web Audio API) ──
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx;
function initAudio() { if (!audioCtx) audioCtx = new AudioCtx(); }

function playSound(type) {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  const g = audioCtx.createGain();
  g.connect(audioCtx.destination);
  const o = audioCtx.createOscillator();
  o.connect(g);
  switch(type) {
    case 'shoot':
      o.type='square'; o.frequency.setValueAtTime(880,now);
      o.frequency.exponentialRampToValueAtTime(440,now+0.05);
      g.gain.setValueAtTime(0.08,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.08);
      o.start(now); o.stop(now+0.08); break;
    case 'laser':
      o.type='sawtooth'; o.frequency.setValueAtTime(1200,now);
      o.frequency.exponentialRampToValueAtTime(200,now+0.15);
      g.gain.setValueAtTime(0.1,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.15);
      o.start(now); o.stop(now+0.15); break;
    case 'missile':
      o.type='sawtooth'; o.frequency.setValueAtTime(150,now);
      o.frequency.exponentialRampToValueAtTime(80,now+0.2);
      g.gain.setValueAtTime(0.12,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.25);
      o.start(now); o.stop(now+0.25); break;
    case 'hit':
      o.type='square'; o.frequency.setValueAtTime(200,now);
      o.frequency.exponentialRampToValueAtTime(80,now+0.1);
      g.gain.setValueAtTime(0.12,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.12);
      o.start(now); o.stop(now+0.12); break;
    case 'explode':
      const buf = audioCtx.createBuffer(1, audioCtx.sampleRate*0.3, audioCtx.sampleRate);
      const d = buf.getChannelData(0);
      for(let i=0;i<d.length;i++) d[i]=(Math.random()*2-1)*Math.pow(1-i/d.length,2);
      const n = audioCtx.createBufferSource(); n.buffer=buf;
      const gn = audioCtx.createGain(); gn.gain.setValueAtTime(0.2,now);
      gn.gain.exponentialRampToValueAtTime(0.001,now+0.3);
      n.connect(gn); gn.connect(audioCtx.destination);
      n.start(now); n.stop(now+0.3); return;
    case 'powerup':
      o.type='sine'; o.frequency.setValueAtTime(523,now);
      o.frequency.setValueAtTime(659,now+0.05);
      o.frequency.setValueAtTime(784,now+0.1);
      o.frequency.setValueAtTime(1047,now+0.15);
      g.gain.setValueAtTime(0.1,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.25);
      o.start(now); o.stop(now+0.25); break;
    case 'bomb':
      const buf2 = audioCtx.createBuffer(1, audioCtx.sampleRate*0.6, audioCtx.sampleRate);
      const d2 = buf2.getChannelData(0);
      for(let i=0;i<d2.length;i++) d2[i]=(Math.random()*2-1)*Math.pow(1-i/d2.length,1.5);
      const n2 = audioCtx.createBufferSource(); n2.buffer=buf2;
      const gn2 = audioCtx.createGain(); gn2.gain.setValueAtTime(0.3,now);
      gn2.gain.exponentialRampToValueAtTime(0.001,now+0.6);
      n2.connect(gn2); gn2.connect(audioCtx.destination);
      n2.start(now); n2.stop(now+0.6); return;
    case 'gameover':
      o.type='sine'; o.frequency.setValueAtTime(440,now);
      o.frequency.setValueAtTime(370,now+0.2);
      o.frequency.setValueAtTime(311,now+0.4);
      o.frequency.setValueAtTime(261,now+0.6);
      g.gain.setValueAtTime(0.15,now); g.gain.exponentialRampToValueAtTime(0.001,now+0.9);
      o.start(now); o.stop(now+0.9); break;
  }
}

// ── Weapons System ──
const WEAPONS = {
  normal:   {name:'기본 기관총', color:'#7ec8e3', shootDelay:8,  sound:'shoot',  desc:'기본 무기'},
  spread:   {name:'확산탄',     color:'#f39c12', shootDelay:12, sound:'shoot',  desc:'넓은 범위 공격'},
  laser:    {name:'레이저',     color:'#e74c3c', shootDelay:4,  sound:'laser',  desc:'고속 연사'},
  missile:  {name:'유도 미사일', color:'#2ecc71', shootDelay:25, sound:'missile',desc:'적 추적 미사일'},
  plasma:   {name:'플라즈마',   color:'#9b59b6', shootDelay:15, sound:'laser',  desc:'관통 공격'},
  gatling:  {name:'가틀링',     color:'#e67e22', shootDelay:3,  sound:'shoot',  desc:'초고속 연사'},
};
const weaponKeys = Object.keys(WEAPONS);

// ── Game State ──
const STATE = { MENU:0, PLAYING:1, OVER:2 };
let state = STATE.MENU, score=0, highScore=+(localStorage.getItem('1942h')||0);
let level=1, levelTimer=0, shakeTimer=0, shakeMag=0;
let totalEnemiesKilled=0, totalEnemiesOnScreen=0;
let weaponPopupTimer=0;

// ── Background ──
const stars=[]; for(let i=0;i<120;i++) stars.push({x:Math.random()*2000,y:Math.random()*2000,s:Math.random()*2+.5,speed:Math.random()*1.5+.5,bright:Math.random()*.6+.4});
const clouds=[]; for(let i=0;i<6;i++) clouds.push({x:Math.random()*2000,y:Math.random()*2000,w:Math.random()*150+80,h:Math.random()*40+20,speed:Math.random()*.8+.3,alpha:Math.random()*.08+.03});
let waterOffset=0;

// ── Player ──
const player = {
  x:0,y:0,w:40,h:44,speed:5,lives:3,
  shootTimer:0,invincible:0,
  weapon:'normal',bombCount:2,killStreak:0,
  init(){this.x=W/2;this.y=H-100;this.lives=3;this.invincible=120;this.weapon='normal';this.bombCount=2;this.killStreak=0;}
};

// ── Input ──
const keys_input={};
let touchActive=false,touchX=0,touchY=0,playerTouchOffsetX=0,playerTouchOffsetY=0;
document.addEventListener('keydown',e=>{keys_input[e.code]=true;e.preventDefault();});
document.addEventListener('keyup',e=>{keys_input[e.code]=false;});
canvas.addEventListener('touchstart',e=>{e.preventDefault();const t=e.touches[0];touchActive=true;touchX=t.clientX;touchY=t.clientY;playerTouchOffsetX=player.x-t.clientX;playerTouchOffsetY=player.y-t.clientY;},{passive:false});
canvas.addEventListener('touchmove',e=>{e.preventDefault();const t=e.touches[0];touchX=t.clientX;touchY=t.clientY;},{passive:false});
canvas.addEventListener('touchend',e=>{e.preventDefault();touchActive=false;},{passive:false});

// ── Game Objects ──
let bullets=[],enemyBullets=[],enemies=[],particles=[],powerups=[];
let enemySpawnTimer=0;

// ── Particles ──
function spawnExplosion(x,y,count,colors,sizeRange){
  for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,sp=Math.random()*4+1;
  particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:30+Math.random()*20,maxLife:50,size:Math.random()*(sizeRange[1]-sizeRange[0])+sizeRange[0],color:colors[Math.floor(Math.random()*colors.length)]});}
}

// ── Weapon Fire ──
function fireWeapon(){
  const w=WEAPONS[player.weapon];
  player.shootTimer=w.shootDelay;
  playSound(w.sound);
  const px=player.x,py=player.y-22;
  switch(player.weapon){
    case 'normal':
      bullets.push({x:px,y:py,vx:0,vy:-10,w:3,h:12,dmg:1,color:w.color,pierce:false});break;
    case 'spread':
      for(let a=-0.4;a<=0.4;a+=0.2) bullets.push({x:px,y:py,vx:Math.sin(a)*6,vy:-9*Math.cos(a),w:3,h:10,dmg:1,color:w.color,pierce:false});break;
    case 'laser':
      bullets.push({x:px,y:py,vx:0,vy:-14,w:2,h:20,dmg:1,color:w.color,pierce:false});break;
    case 'missile':
      bullets.push({x:px-10,y:py,vx:0,vy:-6,w:5,h:14,dmg:3,color:w.color,homing:true,pierce:false});
      bullets.push({x:px+10,y:py,vx:0,vy:-6,w:5,h:14,dmg:3,color:w.color,homing:true,pierce:false});break;
    case 'plasma':
      bullets.push({x:px,y:py,vx:0,vy:-8,w:6,h:16,dmg:2,color:w.color,pierce:true});break;
    case 'gatling':
      const off=(Math.random()-.5)*8;
      bullets.push({x:px+off,y:py,vx:(Math.random()-.5)*1.5,vy:-12,w:2,h:8,dmg:1,color:w.color,pierce:false});break;
  }
}

// ── Spawn ──
function spawnEnemy(){
  const types=['basic','basic','basic','fast','fast','tank'];
  if(level>=3)types.push('fast','fast');if(level>=5)types.push('tank','tank');
  const type=types[Math.floor(Math.random()*types.length)];
  const e={x:Math.random()*(W-60)+30,y:-30,type,shootTimer:Math.random()*60,angle:0,patternTimer:0};
  switch(type){
    case'basic':e.w=24;e.h=28;e.hp=1;e.maxHp=1;e.vy=1.5+level*.2;e.vx=0;e.score=100;e.shootDelay=90;break;
    case'fast':e.w=20;e.h=24;e.hp=1;e.maxHp=1;e.vy=3+level*.15;e.vx=(Math.random()-.5)*3;e.score=150;e.shootDelay=120;break;
    case'tank':e.w=36;e.h=32;e.hp=5+level;e.maxHp=5+level;e.vy=.8;e.vx=0;e.score=500;e.shootDelay=50;break;
  }
  enemies.push(e);
}
function spawnBoss(){
  const hp=30+level*10;
  enemies.push({x:W/2,y:-50,w:50,h:50,type:'boss',hp,maxHp:hp,vy:1,vx:0,score:3000,shootTimer:0,shootDelay:25,phaseTimer:0});
}

function spawnPowerup(x,y){
  if(Math.random()<0.3){
    const types=['weapon','weapon','weapon','life','bomb'];
    powerups.push({x,y,type:types[Math.floor(Math.random()*types.length)],vy:1.5,life:300});
  }
}

function showWeaponPopup(name,desc){
  const el=document.getElementById('weaponPopup');
  el.innerHTML=`🔫 ${name}<br><span style="font-size:13px;color:#aaa">${desc}</span>`;
  el.style.display='block'; weaponPopupTimer=90;
}

function useBomb(){
  if(player.bombCount<=0)return; player.bombCount--;
  playSound('bomb'); shakeTimer=20;shakeMag=12;
  for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];
    if(e.type==='boss'){e.hp-=15;spawnExplosion(e.x,e.y,20,['#ff0','#f80','#f00','#fff'],[3,8]);}
    else{score+=e.score;totalEnemiesKilled++;spawnExplosion(e.x,e.y,15,['#ff0','#f80','#f00'],[2,6]);enemies.splice(i,1);}
  }
  enemyBullets=[];
  particles.push({x:W/2,y:H/2,vx:0,vy:0,life:15,maxLife:15,size:Math.max(W,H),color:'#fff',isBombFlash:true});
}

// ── Update ──
function update(){
  if(state!==STATE.PLAYING)return;
  waterOffset=(waterOffset+1)%H;
  stars.forEach(s=>{s.y+=s.speed;if(s.y>H){s.y=-5;s.x=Math.random()*W;}});
  clouds.forEach(c=>{c.y+=c.speed;if(c.y>H+50){c.y=-c.h-50;c.x=Math.random()*W;}});

  // Player move
  let dx=0,dy=0;
  if(keys_input['ArrowLeft']||keys_input['KeyA'])dx=-player.speed;
  if(keys_input['ArrowRight']||keys_input['KeyD'])dx=player.speed;
  if(keys_input['ArrowUp']||keys_input['KeyW'])dy=-player.speed;
  if(keys_input['ArrowDown']||keys_input['KeyS'])dy=player.speed;
  if(touchActive){const tx=touchX+playerTouchOffsetX,ty=touchY+playerTouchOffsetY;const dd=Math.sqrt((tx-player.x)**2+(ty-player.y)**2);if(dd>2){const spd=Math.min(dd*.15,player.speed*1.5);dx=(tx-player.x)/dd*spd;dy=(ty-player.y)/dd*spd;}}
  player.x=Math.max(player.w/2,Math.min(W-player.w/2,player.x+dx));
  player.y=Math.max(player.h/2,Math.min(H-player.h/2,player.y+dy));

  // Shoot
  player.shootTimer--;
  if((keys_input['Space']||keys_input['KeyZ']||touchActive)&&player.shootTimer<=0) fireWeapon();
  if(keys_input['KeyX']||keys_input['KeyB']){keys_input['KeyX']=false;keys_input['KeyB']=false;useBomb();}
  if(player.invincible>0)player.invincible--;

  // Bullets
  for(let i=bullets.length-1;i>=0;i--){const b=bullets[i];
    if(b.homing){let closest=null,cd=999;enemies.forEach(e=>{const d=Math.sqrt((e.x-b.x)**2+(e.y-b.y)**2);if(d<cd){cd=d;closest=e;}});
      if(closest&&cd<300){const a=Math.atan2(closest.y-b.y,closest.x-b.x);b.vx+= Math.cos(a)*.5;b.vy+=Math.sin(a)*.5;const sp=Math.sqrt(b.vx**2+b.vy**2);b.vx=b.vx/sp*7;b.vy=b.vy/sp*7;}}
    b.x+=b.vx;b.y+=b.vy;if(b.y<-20||b.x<-20||b.x>W+20||b.y>H+20)bullets.splice(i,1);
  }
  for(let i=enemyBullets.length-1;i>=0;i--){const b=enemyBullets[i];b.x+=b.vx;b.y+=b.vy;if(b.y>H+20||b.y<-20||b.x<-20||b.x>W+20)enemyBullets.splice(i,1);}

  // Level
  levelTimer++;
  if(levelTimer>1800){level++;levelTimer=0;if(level%3===0)spawnBoss();}
  enemySpawnTimer--;
  if(enemySpawnTimer<=0){spawnEnemy();enemySpawnTimer=Math.max(20,60-level*5);}
  totalEnemiesOnScreen=enemies.length;

  // Enemies
  for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];
    if(e.type==='boss'){
      if(e.y<80){e.y+=e.vy;}else{e.vy=0;e.phaseTimer++;e.x=W/2+Math.sin(e.phaseTimer*.02)*(W*.3);
        e.shootTimer--;if(e.shootTimer<=0){e.shootTimer=e.shootDelay;const ang=Math.atan2(player.y-e.y,player.x-e.x);
          enemyBullets.push({x:e.x,y:e.y+30,vx:Math.cos(ang)*4,vy:Math.sin(ang)*4,r:4});
          enemyBullets.push({x:e.x-20,y:e.y+20,vx:Math.cos(ang-.2)*3.5,vy:Math.sin(ang-.2)*3.5,r:3});
          enemyBullets.push({x:e.x+20,y:e.y+20,vx:Math.cos(ang+.2)*3.5,vy:Math.sin(ang+.2)*3.5,r:3});}}
      if(e.hp<=0){score+=e.score;totalEnemiesKilled++;playSound('explode');spawnExplosion(e.x,e.y,50,['#ff0','#f80','#f00','#fff','#f0f'],[3,10]);shakeTimer=30;shakeMag=15;spawnPowerup(e.x,e.y);spawnPowerup(e.x-20,e.y);enemies.splice(i,1);continue;}
    }else{
      e.x+=(e.vx||0);e.y+=e.vy;if(e.x<20||e.x>W-20)e.vx=-(e.vx||0);if(e.y>H+40){enemies.splice(i,1);continue;}
      e.shootTimer--;if(e.shootTimer<=0&&e.y>0){e.shootTimer=e.shootDelay;
        if(e.type==='tank'){const ang=Math.atan2(player.y-e.y,player.x-e.x);enemyBullets.push({x:e.x,y:e.y+16,vx:Math.cos(ang)*3,vy:Math.sin(ang)*3,r:4});}
        else enemyBullets.push({x:e.x,y:e.y+14,vx:0,vy:4,r:3});}
    }
    // Bullet-enemy collision
    for(let j=bullets.length-1;j>=0;j--){const b=bullets[j];
      if(Math.abs(b.x-e.x)<e.w&&Math.abs(b.y-e.y)<e.h){
        e.hp-=b.dmg;playSound('hit');spawnExplosion(b.x,b.y,3,['#ff0','#fff'],[1,3]);
        if(!b.pierce)bullets.splice(j,1);
        if(e.hp<=0&&e.type!=='boss'){score+=e.score;totalEnemiesKilled++;player.killStreak++;
          playSound('explode');spawnExplosion(e.x,e.y,15,['#ff0','#f80','#f00'],[2,6]);shakeTimer=5;shakeMag=4;
          // Weapon drop on kill streak
          if(player.killStreak%10===0){const wk=weaponKeys.filter(k=>k!=='normal'&&k!==player.weapon);
            const nw=wk[Math.floor(Math.random()*wk.length)];
            powerups.push({x:e.x,y:e.y,type:'specific_weapon',weaponType:nw,vy:1.5,life:300});}
          else spawnPowerup(e.x,e.y);
          enemies.splice(i,1);break;}
      }
    }
  }

  // Enemy bullets -> player
  if(player.invincible<=0){
    for(let i=enemyBullets.length-1;i>=0;i--){const b=enemyBullets[i];
      if(Math.abs(b.x-player.x)<14&&Math.abs(b.y-player.y)<18){enemyBullets.splice(i,1);playerHit();break;}}
    for(const e of enemies){if(Math.abs(e.x-player.x)<(e.w+player.w)/2&&Math.abs(e.y-player.y)<(e.h+player.h)/2){playerHit();break;}}
  }

  // Powerups
  for(let i=powerups.length-1;i>=0;i--){const p=powerups[i];p.y+=p.vy;p.life--;
    if(p.y>H+20||p.life<=0){powerups.splice(i,1);continue;}
    if(Math.abs(p.x-player.x)<22&&Math.abs(p.y-player.y)<22){
      playSound('powerup');
      if(p.type==='weapon'){const wk=weaponKeys.filter(k=>k!=='normal');const nw=wk[Math.floor(Math.random()*wk.length)];player.weapon=nw;showWeaponPopup(WEAPONS[nw].name,WEAPONS[nw].desc);}
      else if(p.type==='specific_weapon'){player.weapon=p.weaponType;showWeaponPopup(WEAPONS[p.weaponType].name,WEAPONS[p.weaponType].desc);}
      else if(p.type==='life')player.lives=Math.min(5,player.lives+1);
      else if(p.type==='bomb')player.bombCount=Math.min(5,player.bombCount+1);
      spawnExplosion(p.x,p.y,8,['#0f0','#ff0','#0ff'],[2,5]);powerups.splice(i,1);}
  }

  // Particles & popups
  for(let i=particles.length-1;i>=0;i--){const p=particles[i];p.x+=p.vx;p.y+=p.vy;p.life--;if(p.life<=0)particles.splice(i,1);}
  if(shakeTimer>0)shakeTimer--;
  if(weaponPopupTimer>0){weaponPopupTimer--;if(weaponPopupTimer<=0)document.getElementById('weaponPopup').style.display='none';}
  if(score>highScore){highScore=score;localStorage.setItem('1942h',highScore);}
}

function playerHit(){
  player.lives--;player.invincible=120;player.killStreak=0;
  if(player.weapon!=='normal'&&Math.random()<0.5)player.weapon='normal';
  shakeTimer=15;shakeMag=10;playSound('explode');
  spawnExplosion(player.x,player.y,20,['#f00','#ff0','#fff'],[2,6]);
  if(player.lives<=0){state=STATE.OVER;playSound('gameover');
    document.getElementById('finalScore').textContent=`SCORE: ${score.toLocaleString()}`;
    document.getElementById('finalHigh').textContent=`BEST: ${highScore.toLocaleString()}`;
    document.getElementById('gameOverScreen').style.display='flex';}
}

// ── Draw ──
function drawPlayer(x,y){
  if(player.invincible>0&&Math.floor(player.invincible/4)%2)return;
  ctx.save();ctx.translate(x,y);
  // Engine glow & flames
  const gG=ctx.createRadialGradient(0,22,2,0,28,18);gG.addColorStop(0,'rgba(255,150,50,.8)');gG.addColorStop(1,'transparent');ctx.fillStyle=gG;ctx.fillRect(-18,16,36,25);
  const fH=10+Math.random()*8;ctx.fillStyle='#ff6633';ctx.beginPath();ctx.moveTo(-6,20);ctx.lineTo(0,20+fH);ctx.lineTo(6,20);ctx.fill();
  ctx.fillStyle='#ffcc33';ctx.beginPath();ctx.moveTo(-3,20);ctx.lineTo(0,20+fH*.6);ctx.lineTo(3,20);ctx.fill();
  // Body
  ctx.fillStyle='#3a7bc8';ctx.beginPath();ctx.moveTo(0,-22);ctx.lineTo(10,-5);ctx.lineTo(12,10);ctx.lineTo(8,20);ctx.lineTo(-8,20);ctx.lineTo(-12,10);ctx.lineTo(-10,-5);ctx.closePath();ctx.fill();
  // Wings
  ctx.fillStyle='#2c5f8a';ctx.beginPath();ctx.moveTo(-10,0);ctx.lineTo(-28,10);ctx.lineTo(-25,14);ctx.lineTo(-8,12);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(28,10);ctx.lineTo(25,14);ctx.lineTo(8,12);ctx.closePath();ctx.fill();
  // Cockpit
  ctx.fillStyle='#7ec8e3';ctx.beginPath();ctx.ellipse(0,-8,4,7,0,0,Math.PI*2);ctx.fill();
  ctx.restore();
}

function drawEnemy(e){
  ctx.save();ctx.translate(e.x,e.y);
  if(e.type==='basic'){ctx.fillStyle='#4a8c3f';ctx.beginPath();ctx.moveTo(0,-14);ctx.lineTo(12,5);ctx.lineTo(8,14);ctx.lineTo(-8,14);ctx.lineTo(-12,5);ctx.closePath();ctx.fill();
    ctx.fillStyle='#3a6e30';ctx.beginPath();ctx.moveTo(-12,2);ctx.lineTo(-22,8);ctx.lineTo(-18,12);ctx.lineTo(-8,10);ctx.closePath();ctx.fill();ctx.beginPath();ctx.moveTo(12,2);ctx.lineTo(22,8);ctx.lineTo(18,12);ctx.lineTo(8,10);ctx.closePath();ctx.fill();
    ctx.fillStyle='#e74c3c';ctx.beginPath();ctx.ellipse(0,0,3,5,0,0,Math.PI*2);ctx.fill();
  }else if(e.type==='fast'){ctx.fillStyle='#c0392b';ctx.beginPath();ctx.moveTo(0,-12);ctx.lineTo(8,0);ctx.lineTo(18,8);ctx.lineTo(6,12);ctx.lineTo(-6,12);ctx.lineTo(-18,8);ctx.lineTo(-8,0);ctx.closePath();ctx.fill();
    ctx.fillStyle='#ff6b6b';ctx.beginPath();ctx.ellipse(0,2,3,4,0,0,Math.PI*2);ctx.fill();
  }else if(e.type==='tank'){ctx.fillStyle='#7f8c8d';ctx.fillRect(-18,-16,36,32);ctx.fillStyle='#95a5a6';ctx.fillRect(-14,-20,28,8);ctx.fillStyle='#e74c3c';ctx.fillRect(-22,-8,8,20);ctx.fillRect(14,-8,8,20);ctx.fillStyle='#f39c12';ctx.beginPath();ctx.arc(0,0,6,0,Math.PI*2);ctx.fill();
    const hW=36*(e.hp/e.maxHp);ctx.fillStyle='#333';ctx.fillRect(-18,-26,36,4);ctx.fillStyle=e.hp>e.maxHp*.3?'#2ecc71':'#e74c3c';ctx.fillRect(-18,-26,hW,4);
  }else if(e.type==='boss'){ctx.fillStyle='#8e44ad';ctx.beginPath();ctx.moveTo(0,-30);ctx.lineTo(25,-10);ctx.lineTo(40,5);ctx.lineTo(35,25);ctx.lineTo(15,30);ctx.lineTo(-15,30);ctx.lineTo(-35,25);ctx.lineTo(-40,5);ctx.lineTo(-25,-10);ctx.closePath();ctx.fill();
    ctx.fillStyle='#9b59b6';ctx.fillRect(-30,-5,60,15);ctx.fillStyle='#e74c3c';ctx.beginPath();ctx.arc(-15,5,5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(15,5,5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#f1c40f';ctx.beginPath();ctx.arc(0,-10,8,0,Math.PI*2);ctx.fill();
    const bW=70*(e.hp/e.maxHp);ctx.fillStyle='#333';ctx.fillRect(-35,-40,70,6);ctx.fillStyle=e.hp>e.maxHp*.3?'#2ecc71':'#e74c3c';ctx.fillRect(-35,-40,bW,6);
  }
  ctx.restore();
}

function draw(){
  ctx.save();
  if(shakeTimer>0){ctx.translate((Math.random()-.5)*shakeMag,(Math.random()-.5)*shakeMag);}
  // BG
  const grad=ctx.createLinearGradient(0,0,0,H);grad.addColorStop(0,'#0b1628');grad.addColorStop(.4,'#122a45');grad.addColorStop(1,'#163350');ctx.fillStyle=grad;ctx.fillRect(-10,-10,W+20,H+20);
  // Water
  ctx.globalAlpha=.06;ctx.strokeStyle='#4a9eda';ctx.lineWidth=1;
  for(let r=-1;r<H/40+2;r++){const yy=(r*40+waterOffset)%(H+80)-40;ctx.beginPath();for(let x=0;x<W;x+=5){const wy=yy+Math.sin(x*.02+r*.5)*8;x===0?ctx.moveTo(x,wy):ctx.lineTo(x,wy);}ctx.stroke();}
  ctx.globalAlpha=1;
  stars.forEach(s=>{ctx.globalAlpha=s.bright;ctx.fillStyle='#fff';ctx.fillRect(s.x%W,s.y,s.s,s.s);ctx.globalAlpha=1;});
  clouds.forEach(c=>{ctx.globalAlpha=c.alpha;ctx.fillStyle='#fff';ctx.beginPath();ctx.ellipse(c.x%W,c.y,c.w/2,c.h/2,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});

  // Powerups
  powerups.forEach(p=>{ctx.save();ctx.translate(p.x,p.y);
    const isW=p.type==='weapon'||p.type==='specific_weapon';
    ctx.shadowColor=isW?'#f39c12':p.type==='life'?'#2ecc71':'#3498db';ctx.shadowBlur=15;
    ctx.fillStyle=isW?'#f39c12':p.type==='life'?'#2ecc71':'#3498db';
    ctx.beginPath();ctx.arc(0,0,10,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.font='bold 12px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(isW?'W':p.type==='life'?'♥':'B',0,0);ctx.restore();});

  // Enemy bullets
  enemyBullets.forEach(b=>{ctx.fillStyle='#ff4444';ctx.shadowColor='#f00';ctx.shadowBlur=8;ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;});
  // Enemies
  enemies.forEach(e=>drawEnemy(e));
  // Player bullets
  bullets.forEach(b=>{ctx.fillStyle=b.color||'#7ec8e3';ctx.shadowColor=b.color||'#7ec8e3';ctx.shadowBlur=6;
    if(b.homing){ctx.beginPath();ctx.arc(b.x,b.y,b.w,0,Math.PI*2);ctx.fill();}
    else ctx.fillRect(b.x-b.w/2,b.y,b.w,b.h);ctx.shadowBlur=0;});
  // Player
  if(state===STATE.PLAYING)drawPlayer(player.x,player.y);
  // Particles
  particles.forEach(p=>{if(p.isBombFlash){ctx.globalAlpha=p.life/p.maxLife*.7;ctx.fillStyle='#fff';ctx.fillRect(-10,-10,W+20,H+20);ctx.globalAlpha=1;return;}
    ctx.globalAlpha=p.life/p.maxLife;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.size*(p.life/p.maxLife),0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;});

  // ── HUD ──
  // Top bar background
  ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(0,0,W,110);
  ctx.strokeStyle='rgba(126,200,227,0.3)';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,110);ctx.lineTo(W,110);ctx.stroke();

  ctx.fillStyle='#fff';ctx.font='bold 18px monospace';ctx.textAlign='left';
  ctx.fillText(`SCORE ${score.toLocaleString()}`,16,26);
  ctx.fillStyle='#7ec8e3';ctx.font='12px monospace';ctx.fillText(`BEST ${highScore.toLocaleString()}`,16,42);

  // Level & enemies on screen
  ctx.fillStyle='#ffd700';ctx.font='bold 14px monospace';ctx.textAlign='right';
  ctx.fillText(`LV ${level}`,W-16,26);
  ctx.fillStyle='#e74c3c';ctx.font='12px monospace';
  ctx.fillText(`적기: ${totalEnemiesOnScreen}`,W-16,42);
  ctx.fillStyle='#aaa';ctx.fillText(`격추: ${totalEnemiesKilled}`,W-16,56);

  // Lives
  ctx.textAlign='left';ctx.font='14px sans-serif';
  ctx.fillStyle='#aaa';ctx.fillText('LIVES',16,62);
  for(let i=0;i<player.lives;i++){ctx.fillStyle='#e74c3c';ctx.font='18px sans-serif';ctx.fillText('♥',16+i*22,82);}

  // Bombs
  ctx.fillStyle='#aaa';ctx.font='14px sans-serif';
  const bombsX=130;ctx.fillText('BOMB',bombsX,62);
  for(let i=0;i<player.bombCount;i++){ctx.fillStyle='#3498db';ctx.font='16px sans-serif';ctx.fillText('💣',bombsX+i*22,82);}

  // Current weapon
  const cw=WEAPONS[player.weapon];
  ctx.fillStyle='#aaa';ctx.font='12px monospace';ctx.textAlign='left';
  ctx.fillText('WEAPON',16,100);
  ctx.fillStyle=cw.color;ctx.font='bold 13px monospace';
  ctx.fillText(cw.name,80,100);

  // Kill streak
  if(player.killStreak>=5){
    ctx.fillStyle='#ffd700';ctx.font='bold 12px monospace';ctx.textAlign='right';
    ctx.fillText(`🔥 ${player.killStreak} STREAK`,W-16,100);
  }

  ctx.restore();
}

function gameLoop(){update();draw();requestAnimationFrame(gameLoop);}

function startGame(){
  initAudio();
  document.getElementById('startScreen').style.display='none';
  document.getElementById('gameOverScreen').style.display='none';
  document.getElementById('weaponPopup').style.display='none';
  state=STATE.PLAYING;score=0;level=1;levelTimer=0;
  bullets=[];enemyBullets=[];enemies=[];particles=[];powerups=[];
  enemySpawnTimer=60;totalEnemiesKilled=0;weaponPopupTimer=0;
  player.init();
}

document.getElementById('startBtn').addEventListener('click',startGame);
document.getElementById('restartBtn').addEventListener('click',startGame);
let lastTap=0;canvas.addEventListener('touchstart',()=>{const now=Date.now();if(now-lastTap<300&&state===STATE.PLAYING)useBomb();lastTap=now;});
gameLoop();
})();
