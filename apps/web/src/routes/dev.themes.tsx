import { createFileRoute } from '@tanstack/react-router';
import { Alert, AlertDescription, AlertTitle } from '@lamp/ui/components/alert';
import { Badge } from '@lamp/ui/components/badge';
import { Button } from '@lamp/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@lamp/ui/components/card';
import { Checkbox } from '@lamp/ui/components/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@lamp/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@lamp/ui/components/dropdown-menu';
import { Input } from '@lamp/ui/components/input';
import { Label } from '@lamp/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@lamp/ui/components/select';
import { Separator } from '@lamp/ui/components/separator';
import { Switch } from '@lamp/ui/components/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@lamp/ui/components/tabs';
import { Textarea } from '@lamp/ui/components/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@lamp/ui/components/tooltip';
import {
  applyTheme,
  type ColorMode,
  PRESETS,
  type PresetId,
  readTheme,
  resolveMode,
  saveTheme,
  type ThemeChoice,
} from '@lamp/ui/themes/presets';
import { useEffect, useId, useState } from 'react';

/**
 * The theme demo (BACKLOG M1-13): every component in every preset and mode, for tuning the
 * presets by eye. The contrast test in packages/ui checks the numbers.
 */
export const Route = createFileRoute('/dev/themes')({
  component: ThemesDemo,
});

const MODES: ColorMode[] = ['light', 'dark', 'system'];
const TRANSLATIONS = [
  { value: 'bsb', label: 'Berean Standard Bible' },
  { value: 'kjv', label: 'King James Version' },
];

function ThemesDemo() {
  const [choice, setChoice] = useState<ThemeChoice>(() => readTheme(localStorage));

  useEffect(() => {
    const query = matchMedia('(prefers-color-scheme: dark)');
    const apply = () =>
      applyTheme(document.documentElement, choice.preset, resolveMode(choice.mode, query.matches));
    apply();
    saveTheme(localStorage, choice);
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [choice]);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold">Themes</h1>
        <p className="text-muted-foreground">
          The page, and popups (menus, dialogs, tooltips), use the preset chosen here. Each panel
          below shows one preset and mode.
        </p>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Page preset</legend>
          {PRESETS.map((p) => (
            <Button
              key={p.id}
              variant={choice.preset === p.id ? 'default' : 'outline'}
              aria-pressed={choice.preset === p.id}
              onClick={() => setChoice({ ...choice, preset: p.id })}
            >
              {p.name}
            </Button>
          ))}
        </fieldset>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Page mode</legend>
          {MODES.map((mode) => (
            <Button
              key={mode}
              variant={choice.mode === mode ? 'secondary' : 'ghost'}
              aria-pressed={choice.mode === mode}
              onClick={() => setChoice({ ...choice, mode })}
            >
              {mode}
            </Button>
          ))}
        </fieldset>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {PRESETS.flatMap((p) =>
          (['light', 'dark'] as const).map((mode) => (
            <Panel key={`${p.id}-${mode}`} preset={p.id} mode={mode} />
          )),
        )}
      </div>
    </div>
  );
}

function Panel({ preset, mode }: { preset: PresetId; mode: 'light' | 'dark' }) {
  const info = PRESETS.find((p) => p.id === preset)!;
  return (
    <section
      data-theme={preset}
      // `light` switches a panel back from a dark page (see the dark variant in globals.css).
      className={`${mode} flex flex-col gap-4 rounded-xl border bg-background p-4 text-foreground`}
      aria-label={`${info.name}, ${mode}`}
    >
      <header>
        <h2 className="font-semibold">
          {info.name} <span className="font-normal text-muted-foreground">· {mode}</span>
        </h2>
        <p className="text-sm text-muted-foreground">{info.description}</p>
      </header>
      <Showcase />
    </section>
  );
}

function Showcase() {
  const id = useId();
  return (
    <>
      <Reading />
      <div className="flex flex-wrap gap-2">
        <Button>Save</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Delete</Button>
        <Button variant="link">Link</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>Grace</Badge>
        <Badge variant="secondary">Faith</Badge>
        <Badge variant="outline">Prayer</Badge>
        <Badge variant="destructive">Conflict</Badge>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>The Good Shepherd</CardTitle>
          <CardDescription>Sunday 12 October · John 10:1–18</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          Three sections, two takeaways, one open question.
        </CardContent>
        <CardFooter className="text-sm text-muted-foreground">Synced</CardFooter>
      </Card>
      <Alert>
        <AlertTitle>Offline</AlertTitle>
        <AlertDescription>3 changes are waiting to sync.</AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertTitle>Sign-in failed</AlertTitle>
        <AlertDescription>The email or password is wrong.</AlertDescription>
      </Alert>
      <div className="grid gap-2">
        <Label htmlFor={`${id}-title`}>Lesson title</Label>
        <Input id={`${id}-title`} placeholder="e.g. The Good Shepherd" />
        <Input aria-label="Invalid example" aria-invalid defaultValue="Jhn 10:99" />
        <Textarea aria-label="Note" placeholder="Write a note…" />
      </div>
      <div className="flex flex-wrap items-center gap-6">
        <Label>
          <Checkbox defaultChecked /> Answered
        </Label>
        <Label>
          <Checkbox /> Open
        </Label>
        <Label>
          <Switch defaultChecked /> Sync
        </Label>
        <Label>
          <Switch /> Reminders
        </Label>
      </div>
      <Tabs defaultValue="notes">
        <TabsList>
          <TabsTrigger value="notes">Notes</TabsTrigger>
          <TabsTrigger value="verses">Verses</TabsTrigger>
          <TabsTrigger value="review">Review</TabsTrigger>
        </TabsList>
        <TabsContent value="notes" className="text-sm">
          Sections in order.
        </TabsContent>
        <TabsContent value="verses" className="text-sm">
          Every verse cited.
        </TabsContent>
        <TabsContent value="review" className="text-sm">
          Open questions.
        </TabsContent>
      </Tabs>
      <Separator />
      <div className="flex flex-wrap items-center gap-2">
        <Select defaultValue="bsb" items={TRANSLATIONS}>
          <SelectTrigger aria-label="Translation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TRANSLATIONS.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="outline" />}>Section</DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuLabel>Section</DropdownMenuLabel>
            <DropdownMenuItem>Indent</DropdownMenuItem>
            <DropdownMenuItem>Move up</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive">Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" />}>Tooltip</TooltipTrigger>
          <TooltipContent>3 changes waiting</TooltipContent>
        </Tooltip>
        <Dialog>
          <DialogTrigger render={<Button variant="outline" />}>Dialog</DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this section?</DialogTitle>
              <DialogDescription>
                Its notes and tags go too. You can undo for 10 s.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
              <DialogClose render={<Button variant="destructive" />}>Delete</DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

/** Scripture and notes in the reading face, with a verse chip and the four highlights. */
function Reading() {
  return (
    <div className="flex flex-col gap-2 font-serif">
      <p>
        I am the good shepherd.{' '}
        <span className="rounded-md bg-secondary px-1.5 py-0.5 font-sans text-sm text-secondary-foreground">
          John 10:11 · BSB
        </span>{' '}
        <em>The good shepherd lays down His life for the sheep.</em>
      </p>
      <p className="text-sm">
        <mark className="bg-highlight-yellow text-foreground">yellow</mark>{' '}
        <mark className="bg-highlight-green text-foreground">green</mark>{' '}
        <mark className="bg-highlight-blue text-foreground">blue</mark>{' '}
        <mark className="bg-highlight-pink text-foreground">pink</mark>{' '}
        <a className="text-primary underline underline-offset-4" href="#top">
          a link
        </a>
      </p>
    </div>
  );
}
