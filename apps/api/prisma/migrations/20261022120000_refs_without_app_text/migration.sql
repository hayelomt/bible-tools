-- Decision 97: a verse reference keeps no translation or text of the app's own; a chip reads the
-- BSB or KJV in the translation the user picked. What was stored before (a BSB or KJV
-- `translation`, its `snapshotText`) leaves every reference: section bodies' chips, lessons' main
-- passages, highlights, memory verses, inbox items and frozen compile views. Text from outside
-- (`shared`, `pasted`) stays as it came. The devices make the same change to what they hold
-- (Dexie version 14), so no row's `rev` moves; an older app gets 426 until it updates.

CREATE FUNCTION lamp_ref_without_app_text(ref jsonb) RETURNS jsonb
  LANGUAGE sql IMMUTABLE AS $$
    SELECT CASE
      WHEN jsonb_typeof(ref) IS DISTINCT FROM 'object'
        OR ref ->> 'translation' IN ('shared', 'pasted') THEN ref
      ELSE ref - 'translation' - 'versionLabel' - 'snapshotText'
    END
  $$;

-- Every chip (`{"type": "verse", "attrs": …}`) anywhere in a value.
CREATE FUNCTION lamp_chips_without_app_text(value jsonb) RETURNS jsonb
  LANGUAGE plpgsql IMMUTABLE AS $$
    BEGIN
      CASE jsonb_typeof(value)
        WHEN 'array' THEN
          RETURN (
            SELECT coalesce(jsonb_agg(lamp_chips_without_app_text(e) ORDER BY i), '[]'::jsonb)
            FROM jsonb_array_elements(value) WITH ORDINALITY AS t(e, i)
          );
        WHEN 'object' THEN
          RETURN (
            SELECT coalesce(
              jsonb_object_agg(
                k,
                CASE
                  WHEN k = 'attrs' AND value ->> 'type' = 'verse' THEN lamp_ref_without_app_text(v)
                  ELSE lamp_chips_without_app_text(v)
                END
              ),
              '{}'::jsonb
            )
            FROM jsonb_each(value) AS t(k, v)
          );
        ELSE
          RETURN value;
      END CASE;
    END
  $$;

UPDATE "section"
SET body = lamp_chips_without_app_text(body)
WHERE body::text LIKE '%"verse"%';

UPDATE "lesson"
SET main_passages = (
  SELECT jsonb_agg(lamp_ref_without_app_text(p) ORDER BY i)
  FROM jsonb_array_elements(main_passages) WITH ORDINALITY AS t(p, i)
)
WHERE jsonb_array_length(main_passages) > 0;

UPDATE "highlight" SET ref = lamp_ref_without_app_text(ref);
UPDATE "memory_item" SET ref = lamp_ref_without_app_text(ref);
UPDATE "inbox_item" SET ref = lamp_ref_without_app_text(ref) WHERE ref IS NOT NULL;

UPDATE "share_link"
SET snapshot = lamp_chips_without_app_text(snapshot)
WHERE target_type = 'compile' AND snapshot IS NOT NULL;

DROP FUNCTION lamp_chips_without_app_text(jsonb);
DROP FUNCTION lamp_ref_without_app_text(jsonb);
