import { describe, it, expect } from "vitest";
import { htmlToText } from "../app/services/site-knowledge.server.js";
describe("site", () => {
  it("html → texte", () => {
    const t = htmlToText("<header>menu</header><main><h2>Livraison</h2><p>Gratuite&nbsp;en 24h</p><script>x()</script><ul><li>Cash</li></ul></main><footer>f</footer>");
    expect(t).toContain("Livraison\nGratuite en 24h"); expect(t).toContain("- Cash"); expect(t).not.toContain("menu"); expect(t).not.toContain("x()");
  });
});
