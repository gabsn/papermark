// selfhost: static image imports (next/image types are not picked up by tsconfig.selfhost.json).
declare module "*.svg" {
  const content: import("next/dist/shared/lib/image-external").StaticImageData;
  export default content;
}
