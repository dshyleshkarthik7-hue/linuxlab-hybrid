import http from "node:http";
import { spawn } from "node:child_process";
import { WebSocketServer } from "ws";

const PORT=Number(process.env.PORT||8080);
const IMAGE=process.env.TERMINAL_IMAGE||"kalilinux/kali-rolling";
const MAX_SESSIONS=Number(process.env.MAX_SESSIONS||2);
const SESSION_MS=Number(process.env.SESSION_MS||15*60*1000);
const MAX_INPUT=4096;
let active=0;

function json(res,status,body){const data=JSON.stringify(body);res.writeHead(status,{"content-type":"application/json","cache-control":"no-store","content-length":Buffer.byteLength(data)});res.end(data);}
const server=http.createServer((req,res)=>{
  if(req.method==="GET"&&req.url==="/health")return json(res,200,{ok:true,activeSessions:active,maxSessions:MAX_SESSIONS});
  json(res,404,{error:"not_found"});
});
const wss=new WebSocketServer({server,maxPayload:MAX_INPUT});

wss.on("connection",(socket)=>{
  if(active>=MAX_SESSIONS){socket.close(1013,"free_tier_busy");return;}
  active++;
  let closed=false;
  const child=spawn("docker",[
    "run","--rm","-i","--read-only",
    "--tmpfs","/tmp:rw,nosuid,nodev,noexec,size=64m",
    "--tmpfs","/run:rw,nosuid,nodev,noexec,size=16m",
    "--pids-limit","64","--memory","256m","--cpus","0.50",
    "--network","none","--cap-drop","ALL",
    "--security-opt","no-new-privileges",
    "--user","65532:65532",IMAGE,"/bin/bash","--noprofile","--norc"
  ],{stdio:["pipe","pipe","pipe"]});
  const timer=setTimeout(()=>{
    if(socket.readyState===socket.OPEN){socket.send("\r\n[Free-tier session expired.]\r\n");socket.close(1000,"session_expired");}
    finish();
  },SESSION_MS);
  const finish=()=>{if(closed)return;closed=true;clearTimeout(timer);if(!child.killed)child.kill("SIGKILL");active=Math.max(0,active-1);};
  child.stdout.on("data",c=>{if(socket.readyState===socket.OPEN)socket.send(c.toString("utf8"));});
  child.stderr.on("data",c=>{if(socket.readyState===socket.OPEN)socket.send(c.toString("utf8"));});
  child.on("error",e=>{if(socket.readyState===socket.OPEN){socket.send("\r\n[Container backend unavailable.]\r\n");socket.close(1011,"container_error");}finish();});
  child.on("exit",()=>{if(socket.readyState===socket.OPEN)socket.close(1000,"container_exit");finish();});
  socket.on("message",(data,isBinary)=>{if(!isBinary&&data.length<=MAX_INPUT&&child.stdin.writable)child.stdin.write(data.toString("utf8"));});
  socket.on("close",finish); socket.on("error",finish);
});
server.listen(PORT,"0.0.0.0",()=>console.log("LinuxTerminal container terminal on :"+PORT));
