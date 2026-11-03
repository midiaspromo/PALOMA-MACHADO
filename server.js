require("dotenv").config();
const express=require("express"),helmet=require("helmet"),rateLimit=require("express-rate-limit"),Database=require("better-sqlite3"),bcrypt=require("bcryptjs"),session=require("express-session"),SQLiteStore=require("connect-sqlite3")(session),path=require("path"),fs=require("fs"),crypto=require("crypto");
const app=express(),PORT=process.env.PORT||3000,DATA_DIR=process.env.DATA_DIR||path.join(__dirname,"data");
fs.mkdirSync(DATA_DIR,{recursive:true});
const db=new Database(path.join(DATA_DIR,"nutrimatch.sqlite"));db.pragma("journal_mode=WAL");
db.exec(`CREATE TABLE IF NOT EXISTS participants(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL,phone TEXT NOT NULL,email TEXT,profile TEXT NOT NULL,profile_key TEXT,answers_json TEXT NOT NULL,consent INTEGER NOT NULL,consent_text TEXT,created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_participants_created ON participants(created_at);
CREATE TABLE IF NOT EXISTS admins(id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT UNIQUE NOT NULL,password_hash TEXT NOT NULL,must_change_password INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);`);
const username=process.env.ADMIN_USERNAME||"admin",initialPassword=process.env.ADMIN_INITIAL_PASSWORD||"Paloma@Nutri2026!";
if(initialPassword.length<12)throw new Error("ADMIN_INITIAL_PASSWORD deve ter pelo menos 12 caracteres.");
const exists=db.prepare("SELECT id FROM admins WHERE username=?").get(username);
if(!exists)db.prepare("INSERT INTO admins(username,password_hash,must_change_password,created_at) VALUES(?,?,1,?)").run(username,bcrypt.hashSync(initialPassword,12),new Date().toISOString());
let sessionSecret=String(process.env.SESSION_SECRET||"").trim();
if(sessionSecret.length<32){
  const secretFile=path.join(DATA_DIR,".session-secret");
  try {
    if(fs.existsSync(secretFile)) sessionSecret=fs.readFileSync(secretFile,"utf8").trim();
    if(sessionSecret.length<32){
      sessionSecret=crypto.randomBytes(48).toString("hex");
      fs.writeFileSync(secretFile,sessionSecret,{mode:0o600});
    }
    console.warn("AVISO: SESSION_SECRET não configurado; usando chave persistente em DATA_DIR. Configure-a no Coolify.");
  } catch(err) { console.error("Falha ao criar SESSION_SECRET persistente:",err); process.exit(1); }
}
app.set("trust proxy",process.env.TRUST_PROXY==="1"?1:false);
app.use(helmet({contentSecurityPolicy:false}));
app.use(express.json({limit:"30kb"}));
app.use("/api/auth/login",rateLimit({windowMs:15*60*1000,limit:8,standardHeaders:true,legacyHeaders:false}));
app.use("/api",rateLimit({windowMs:15*60*1000,limit:150}));
app.use(session({store:new SQLiteStore({db:"sessions.sqlite",dir:DATA_DIR}),name:"nutrimatch.sid",secret:sessionSecret,resave:false,saveUninitialized:false,cookie:{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",maxAge:8*60*60*1000}}));
app.use(express.static(__dirname,{index:"index.html",dotfiles:"deny"}));
app.get("/admin",(req,res)=>res.sendFile(path.join(__dirname,"admin.html")));
function csrf(req,res,next){if(!req.session.csrf)req.session.csrf=crypto.randomBytes(32).toString("hex");next()}
app.get("/api/auth/status",csrf,(req,res)=>res.json({authenticated:!!req.session.adminId,mustChange:!!req.session.mustChange,csrf:req.session.csrf}));
function requireCsrf(req,res,next){const sent=req.get("X-CSRF-Token");if(!sent||!req.session.csrf||!crypto.timingSafeEqual(Buffer.from(sent),Buffer.from(req.session.csrf)))return res.status(403).json({error:"Token de segurança inválido. Atualize a página."});next()}
function requireAdmin(req,res,next){if(!req.session.adminId)return res.status(401).json({error:"Faça login para continuar."});if(req.session.mustChange)return res.status(403).json({error:"Troque a senha temporária antes de continuar."});next()}
app.post("/api/auth/login",requireCsrf,async(req,res)=>{const u=String(req.body.username||"").trim(),p=String(req.body.password||"");const row=db.prepare("SELECT * FROM admins WHERE username=?").get(u);if(!row||!bcrypt.compareSync(p,row.password_hash))return res.status(401).json({error:"Usuário ou senha incorretos."});req.session.regenerate(err=>{if(err)return res.status(500).json({error:"Não foi possível iniciar sessão."});req.session.adminId=row.id;req.session.username=row.username;req.session.mustChange=!!row.must_change_password;req.session.csrf=crypto.randomBytes(32).toString("hex");req.session.save(err=>{if(err)return res.status(500).json({error:"Falha ao salvar sessão."});res.json({ok:true,mustChange:req.session.mustChange,csrf:req.session.csrf})})})});
function requireAdminPasswordChange(req,res,next){if(!req.session.adminId)return res.status(401).json({error:"Faça login."});next()}
app.post("/api/auth/change-password",requireCsrf,requireAdminPasswordChange,(req,res)=>{const old=String(req.body.oldPassword||""),next=String(req.body.newPassword||"");if(next.length<12)return res.status(400).json({error:"A nova senha deve ter pelo menos 12 caracteres."});const row=db.prepare("SELECT * FROM admins WHERE id=?").get(req.session.adminId);if(!row||!bcrypt.compareSync(old,row.password_hash))return res.status(401).json({error:"Senha atual incorreta."});if(old===next)return res.status(400).json({error:"Escolha uma senha diferente da atual."});db.prepare("UPDATE admins SET password_hash=?,must_change_password=0 WHERE id=?").run(bcrypt.hashSync(next,12),row.id);req.session.mustChange=false;req.session.csrf=crypto.randomBytes(32).toString("hex");req.session.save(()=>res.json({ok:true,csrf:req.session.csrf}))});
app.post("/api/auth/logout",requireCsrf,(req,res)=>req.session.destroy(()=>{res.clearCookie("nutrimatch.sid");res.json({ok:true})}));
const insert=db.prepare("INSERT INTO participants(name,phone,email,profile,profile_key,answers_json,consent,consent_text,created_at) VALUES(?,?,?,?,?,?,?,?,?)");
app.post("/api/quiz",(req,res)=>{const b=req.body||{},name=String(b.name||"").trim().slice(0,120),phone=String(b.phone||"").replace(/[^\d+]/g,"").slice(0,25),email=String(b.email||"").trim().slice(0,180),profile=String(b.profile||"").trim().slice(0,100),profileKey=String(b.profileKey||"").trim().slice(0,50);if(!name||phone.replace(/\D/g,"").length<10||!profile||b.consent!==true)return res.status(400).json({error:"Nome, WhatsApp, perfil e consentimento são necessários."});const answers=Array.isArray(b.answers)?b.answers.slice(0,12).map(x=>Number.isInteger(x)?x:null):[];const consentText="Autorizo o armazenamento dos dados informados para receber contato sobre meu resultado e possível acompanhamento. Posso solicitar a exclusão.";const info=insert.run(name,phone,email,profile,profileKey,JSON.stringify(answers),1,consentText,new Date().toISOString());res.status(201).json({ok:true,id:info.lastInsertRowid})});
app.get("/api/admin/participants",requireAdmin,(req,res)=>{const rows=db.prepare("SELECT id,name,phone,email,profile,answers_json,consent,created_at FROM participants ORDER BY id DESC LIMIT 3000").all();res.json(rows.map(r=>({...r,answers:JSON.parse(r.answers_json),answers_json:undefined})))});
app.get("/api/admin/export.csv",requireAdmin,(req,res)=>{const rows=db.prepare("SELECT id,name,phone,email,profile,answers_json,consent,created_at FROM participants ORDER BY id DESC").all(),esc=v=>'"'+String(v??"").replace(/"/g,'""')+'"';const csv=["id,nome,whatsapp,email,perfil,respostas,consentimento,data",...rows.map(r=>[r.id,r.name,r.phone,r.email,r.profile,r.answers_json,r.consent?"Sim":"Não",r.created_at].map(esc).join(","))].join("\r\n");res.setHeader("Content-Type","text/csv; charset=utf-8");res.setHeader("Content-Disposition",'attachment; filename="nutrimatch-participantes.csv"');res.send("\ufeff"+csv)});
app.get("/api/health",(req,res)=>res.json({ok:true}));\napp.get("/healthz",(req,res)=>res.status(200).send("ok"));
const server=app.listen(PORT,"0.0.0.0",()=>console.log(`NutriMatch iniciado na porta ${PORT}; painel em /admin`));\nserver.on("error",err=>{console.error("Falha ao iniciar servidor HTTP:",err);process.exit(1);});
