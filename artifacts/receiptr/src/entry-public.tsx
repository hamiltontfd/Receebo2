import { renderToString } from "react-dom/server";
import PublicDocument from "./public-document";
export { pageMetadata, publicPages } from "./lib/publicSeo";

export function render(path: string) {
  return renderToString(<PublicDocument path={path} />);
}
