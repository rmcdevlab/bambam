import "server-only";
import { mkdir,writeFile,readFile,rm } from "node:fs/promises";
import { resolve,dirname,sep } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "../platform/service";
import { one,query,fail } from "../platform/query";
import { visible } from "./service";
import { photo } from "./repository";
export function storageRoot() {
 const directory=process.env.PHOTO_STORAGE_DIR;
 if(!directory&&process.env.APP_ENV!=="development")throw new Error("PHOTO_STORAGE_DIR must be a persistent directory");
 return resolve(directory??"data/photos");
}
export function filePath(key:string) {
 const root=storageRoot(),path=resolve(root,key);if(!path.startsWith(root+sep))throw new Error("Invalid storage key");return path;
}
export async function deleteFile(key:string) {await rm(filePath(key),{force:true});}
export async function upload(request:NextRequest,u:User) {
 const length=Number(request.headers.get("content-length"));if(length>11*1024*1024)fail("PHOTO_TOO_LARGE","invalid");
 const reader=request.body?.getReader();if(!reader)fail("PHOTO_TYPE_NOT_ALLOWED","invalid");
 const chunks:Uint8Array[]=[];let size=0;
 try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>11*1024*1024)fail("PHOTO_TOO_LARGE","invalid");chunks.push(value);}}finally{await reader.cancel();}
 const form=await new Response(new Uint8Array(Buffer.concat(chunks)),{headers:{"Content-Type":request.headers.get("content-type")??""}}).formData(),file=form.get("file");if(!(file instanceof File))fail("PHOTO_TYPE_NOT_ALLOWED","invalid");
 if(file.size>10*1024*1024)fail("PHOTO_TOO_LARGE","invalid");const data=Buffer.from(await file.arrayBuffer());
 const heic=data.length>12&&data.toString("ascii",4,8)==="ftyp"&&/heic|heix|hevc|hevx/.test(data.toString("ascii",8,24));
 let format="",thumb:Buffer|undefined;
 if(heic)format="heic";else{
  try{const metadata=await sharp(data,{limitInputPixels:50_000_000}).metadata();format=metadata.format??"";
   if(!["jpeg","png","webp"].includes(format))fail("PHOTO_TYPE_NOT_ALLOWED","invalid");
   thumb=await sharp(data,{limitInputPixels:50_000_000}).resize({width:480,height:480,fit:"inside",withoutEnlargement:true}).jpeg({quality:75}).toBuffer();
  }catch{fail("PHOTO_TYPE_NOT_ALLOWED","invalid");}
 }
 const id=randomUUID(),dir=new Date().toISOString().slice(0,7).replace("-","/"),key=`${dir}/${id}.${format==="jpeg"?"jpg":format}`,thumbKey=thumb?`${dir}/${id}_thumb.jpg`:key;
 await mkdir(dirname(filePath(key)),{recursive:true,mode:0o700});
 try{
  await writeFile(filePath(key),data,{flag:"wx",mode:0o600});if(thumb)await writeFile(filePath(thumbKey),thumb,{flag:"wx",mode:0o600});
  await query("repair.InsertPhoto",{id,uploader_id:u.id,content_type:`image/${format}`,size_bytes:data.length,storage_key:key,thumb_key:thumbKey,thumb_content_type:thumb?"image/jpeg":`image/${format}`});
 }catch(error){await Promise.all([deleteFile(key),deleteFile(thumbKey)]);throw error;}
 return photo(id);
}
export async function open(id:string,thumb:boolean,u:User) {
 const p=await one("repair.GetPhoto",{id},undefined,"PHOTO_NOT_FOUND");
 if(!p.ticket_id){if(p.uploader_id!==u.id)fail("FORBIDDEN","forbidden");}
 else if(!(p.kind==="report"&&p.ticket_status!=="closed"))await visible(p.ticket_id,u);
 let data:Buffer;try{data=await readFile(filePath(thumb?p.thumb_key:p.storage_key));}catch{fail("PHOTO_NOT_FOUND","not_found");}
 return new NextResponse(new Uint8Array(data!),{headers:{"Content-Type":thumb?p.thumb_content_type:p.content_type,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"}});
}
