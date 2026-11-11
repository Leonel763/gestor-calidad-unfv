/**
 * Validación preliminar de encabezados. No reemplaza un escaneo antivirus,
 * pero evita aceptar extensiones que contradicen los bytes iniciales.
 * Se ejecuta solamente sobre nuevos archivos seleccionados por el usuario.
 */
export async function checkFileSignature(file:File):Promise<string|null>{
  const ext=file.name.split('.').pop()?.toLowerCase()||'';
  const data=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const matches=(bytes:number[])=>bytes.every((b,i)=>data[i]===b);
  const pdf=matches([0x25,0x50,0x44,0x46,0x2d]);
  const jpg=matches([0xff,0xd8,0xff]);
  const png=matches([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);
  const zip=matches([0x50,0x4b,0x03,0x04])||matches([0x50,0x4b,0x05,0x06]);
  const ole=matches([0xd0,0xcf,0x11,0xe0,0xa1,0xb1,0x1a,0xe1]);
  const valid=({pdf,jpg,jpeg:jpg,png,doc:ole,xls:ole,docx:zip,xlsx:zip} as Record<string,boolean>)[ext];
  if(valid===undefined)return 'Tipo de archivo no permitido.';
  if(!valid)return 'El contenido no coincide con la extensión del archivo. Comprueba el formato original.';
  return null;
}
