import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTemplate } from "@/lib/services";
import { buildFaker, buildLocalePool, runFakerPath } from "@/lib/faker";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();
  if (!session?.accessToken) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const template = await getTemplate(params.id);
  if (!template) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Collect all locales referenced across entities as the "job preferences"
  // so the preview uses the most representative locale per entity.
  const allLocales = [...new Set(template.entities.flatMap((e) => e.localeFallbacks))];

  const entities = template.entities.map((entity) => {
    const locale = buildLocalePool(allLocales, entity.localeFallbacks)[0] ?? "en";
    const f = buildFaker(locale);

    const fields = entity.fields.map((rule) => {
      let value = "";
      try {
        switch (rule.strategy) {
          case "faker":
            value = rule.fakerPath ? String(runFakerPath(f, rule.fakerPath)) : "(no path)";
            break;
          case "static":
            value = rule.value ?? "";
            break;
          case "list":
            value = rule.list?.[Math.floor(Math.random() * (rule.list.length || 1))] ?? "";
            break;
          case "sequence":
            value = f.string.alphanumeric(8).toUpperCase();
            break;
          case "fk":
            value = `(fk → ${rule.fkEntity ?? "?"})`;
            break;
          case "mdolist":
            value = `(MDO list: ${rule.listName ?? rule.listId ?? "?"})`;
            break;
        }
      } catch {
        value = "(error)";
      }
      return { field: rule.field, value };
    });

    return { entityType: entity.name, locale, fields };
  });

  return NextResponse.json({ entities });
}
