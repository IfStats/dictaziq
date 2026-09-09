CREATE TABLE "team_source_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_team_id" text NOT NULL,
	"source_name" text NOT NULL,
	"source_country" text,
	"source_url" text,
	"match_method" text NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence" jsonb NOT NULL,
	CONSTRAINT "team_source_mappings_source_check" CHECK (
		length(trim("team_source_mappings"."source")) > 0
	),
	CONSTRAINT "team_source_mappings_source_team_id_check" CHECK (
		length(trim("team_source_mappings"."source_team_id")) > 0
	),
	CONSTRAINT "team_source_mappings_source_name_check" CHECK (
		length(trim("team_source_mappings"."source_name")) > 0
	),
	CONSTRAINT "team_source_mappings_method_check" CHECK (
		"team_source_mappings"."match_method" IN (
			'exact',
			'alias',
			'manual',
			'seed'
		)
	),
	CONSTRAINT "team_source_mappings_evidence_check" CHECK (
		jsonb_typeof("team_source_mappings"."evidence") = 'object'
	)
);
--> statement-breakpoint
ALTER TABLE "team_source_mappings"
ADD CONSTRAINT "team_source_mappings_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "team_source_mappings_source_team_unique" ON "team_source_mappings" USING btree ("source", "source_team_id");
--> statement-breakpoint
CREATE INDEX "team_source_mappings_team_idx" ON "team_source_mappings" USING btree ("team_id");
--> statement-breakpoint
CREATE INDEX "team_source_mappings_source_name_idx" ON "team_source_mappings" USING btree ("source", "source_name");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dictaziq_guard_team_source_mapping() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE checked_at timestamptz;
BEGIN checked_at := clock_timestamp();
/*
 * Normalize provider metadata.
 *
 * source_team_id is only trimmed, not lower-cased:
 * some future providers may use case-sensitive IDs.
 */
NEW.source := lower(trim(NEW.source));
NEW.source_team_id := trim(NEW.source_team_id);
NEW.source_name := trim(NEW.source_name);
NEW.match_method := lower(trim(NEW.match_method));
IF NEW.source_country IS NOT NULL THEN NEW.source_country := NULLIF(trim(NEW.source_country), '');
END IF;
IF NEW.source_url IS NOT NULL THEN NEW.source_url := NULLIF(trim(NEW.source_url), '');
END IF;
IF NEW.source = '' THEN RAISE EXCEPTION 'Team source mapping source must not be empty.';
END IF;
IF NEW.source_team_id = '' THEN RAISE EXCEPTION 'Team source mapping source_team_id must not be empty.';
END IF;
IF NEW.source_name = '' THEN RAISE EXCEPTION 'Team source mapping source_name must not be empty.';
END IF;
/*
 * The canonical DictazIQ team must exist.
 */
PERFORM 1
FROM public.teams
WHERE id = NEW.team_id FOR SHARE;
IF NOT FOUND THEN RAISE EXCEPTION 'Canonical DictazIQ team does not exist.';
END IF;
/*
 * If a URL is supplied, require HTTP(S).
 */
IF NEW.source_url IS NOT NULL
AND NEW.source_url !~* '^https?://' THEN RAISE EXCEPTION 'Team source mapping URL must use http or https.';
END IF;
IF TG_OP = 'INSERT' THEN
/*
 * Caller cannot backdate mapping creation.
 */
NEW.created_at := checked_at;
NEW.updated_at := checked_at;
RETURN NEW;
END IF;
/*
 * Provider identity is permanent.
 *
 * If FootballDatabase says sourceTeamId=X,
 * that identity cannot later be silently rewritten to Y.
 */
IF NEW.source IS DISTINCT
FROM OLD.source THEN RAISE EXCEPTION 'Team source mapping source is immutable.';
END IF;
IF NEW.source_team_id IS DISTINCT
FROM OLD.source_team_id THEN RAISE EXCEPTION 'Team source mapping source_team_id is immutable.';
END IF;
IF NEW.created_at IS DISTINCT
FROM OLD.created_at THEN RAISE EXCEPTION 'Team source mapping created_at is database controlled.';
END IF;
/*
 * A verified mapping can be corrected, but only
 * explicitly as a verified manual remap.
 *
 * This prevents an automated exact-name matcher
 * from silently moving an already-reviewed source
 * identity onto another canonical team.
 */
IF OLD.is_verified = true
AND NEW.team_id IS DISTINCT
FROM OLD.team_id THEN IF NEW.match_method <> 'manual'
	OR NEW.is_verified <> true THEN RAISE EXCEPTION 'Changing a verified team mapping requires a verified manual remap.';
END IF;
END IF;
NEW.updated_at := checked_at;
RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER team_source_mappings_guard BEFORE
INSERT
	OR
UPDATE ON public.team_source_mappings FOR EACH ROW EXECUTE FUNCTION public.dictaziq_guard_team_source_mapping();
--> statement-breakpoint
CREATE TRIGGER team_source_mappings_no_delete BEFORE DELETE ON public.team_source_mappings FOR EACH ROW EXECUTE FUNCTION public.dictaziq_reject_history_change();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION public.dictaziq_reject_team_source_mapping_truncate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Team source mappings cannot be truncated.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER team_source_mappings_no_truncate BEFORE TRUNCATE ON public.team_source_mappings FOR EACH STATEMENT EXECUTE FUNCTION public.dictaziq_reject_team_source_mapping_truncate();