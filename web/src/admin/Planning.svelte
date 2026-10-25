<script lang="ts">
  import type { Meal, PlanningWeek, RecipeCard } from '../lib/types';
  import { icon, iconBadge } from '../lib/icons';
  import { MEALS, dayMonth, weekRange, weekday } from '../lib/planning';
  import { api, navigate, notify } from './client.svelte';
  import RecipePicker from './RecipePicker.svelte';

  let { week, isPrivate, isAdmin }: { week?: string; isPrivate: boolean; isAdmin: boolean } = $props();
  let plan = $state<PlanningWeek | null>(null);
  // Slot whose recipe picker is open, as "date/meal".
  let picking = $state<string | null>(null);

  $effect(() => {
    const requested = week;
    plan = null;
    api
      .get<PlanningWeek>(`/planning${requested ? `?week=${requested}` : ''}`)
      .then((p) => (plan = p))
      .catch((e) => notify((e as Error).message, 'error'));
  });

  async function save(date: string, meal: Meal, recipes: RecipeCard[]) {
    const day = plan!.days.find((d) => d.date === date)!;
    const previous = day.meals[meal];
    day.meals[meal] = recipes;
    try {
      const res = await api.put<{ recipes: RecipeCard[] }>(`/planning/${date}/${meal}`, { recipe_ids: recipes.map((r) => r.id) });
      day.meals[meal] = res.recipes;
    } catch (e) {
      day.meals[meal] = previous;
      notify((e as Error).message, 'error');
    }
  }

  function move(list: RecipeCard[], from: number, to: number) {
    const next = [...list];
    next.splice(to, 0, next.splice(from, 1)[0]);
    return next;
  }
</script>

{#if !plan}
  <p class="muted">Chargement…</p>
{:else}
  <div class="toolbar">
    <div>
      <h1 style="margin:0">Planning</h1>
      <small class="muted">{weekRange(plan.week, plan.days[6].date)}</small>
    </div>
    <span class="spacer"></span>
    <button class="btn small" onclick={() => navigate(`/planning/${plan!.prev}`)} aria-label="Semaine précédente">{@html icon('chevron-left', 16)}</button>
    {#if plan.today < plan.week || plan.today > plan.days[6].date}
      <button class="btn small" onclick={() => navigate('/planning')}>Cette semaine</button>
    {/if}
    <button class="btn small" onclick={() => navigate(`/planning/${plan!.next}`)} aria-label="Semaine suivante">{@html icon('chevron-right', 16)}</button>
    <a class="btn small" href={`/planning?semaine=${plan.week}`} target="_blank" rel="noopener">Voir la page</a>
  </div>
  {#if isPrivate}
    <p class="card notice">
      Planning privé : sur le site, seuls les membres connectés le voient.
      {#if isAdmin}<a href="#/parametres">Le rendre public</a>{:else}Un administrateur peut le rendre public.{/if}
    </p>
  {/if}

  <div class="days">
    {#each plan.days as day (day.date)}
      <section class="card day" class:today={day.date === plan.today}>
        <h2><span class="weekday">{weekday(day.date)}</span> <small class="muted">{dayMonth(day.date)}</small></h2>
        {#each MEALS as meal}
          {@const recipes = day.meals[meal.key]}
          {@const slot = `${day.date}/${meal.key}`}
          <div class="meal">
            <h3>{meal.label}</h3>
            <ul>
              {#each recipes as r, i (r.id)}
                <li>
                  {#if r.cover}<img src={r.cover.sm} alt="" loading="lazy" />{:else}<span class="ph">{@html iconBadge(r.category?.icon ?? 'cooking-pot', 24)}</span>{/if}
                  <span class="grow">
                    {r.title}
                    {#if !r.published}<span class="badge" title="Invisible sur la page publique">Brouillon</span>{/if}
                  </span>
                  <span class="actions">
                    <button type="button" disabled={i === 0} onclick={() => save(day.date, meal.key, move(recipes, i, i - 1))} aria-label="Monter">↑</button>
                    <button type="button" disabled={i === recipes.length - 1} onclick={() => save(day.date, meal.key, move(recipes, i, i + 1))} aria-label="Descendre">↓</button>
                    <button type="button" onclick={() => save(day.date, meal.key, recipes.filter((x) => x.id !== r.id))} aria-label={`Retirer ${r.title}`}>{@html icon('x', 14)}</button>
                  </span>
                </li>
              {/each}
            </ul>
            {#if picking === slot}
              <RecipePicker
                exclude={recipes.map((r) => r.id)}
                onpick={(r) => {
                  picking = null;
                  save(day.date, meal.key, [...recipes, r]);
                }}
                onclose={() => picking === slot && (picking = null)}
              />
            {:else if recipes.length < 6}
              <button type="button" class="add" onclick={() => (picking = slot)}>+ Ajouter une recette</button>
            {/if}
          </div>
        {/each}
      </section>
    {/each}
  </div>
{/if}

<style>
  .notice {
    margin: 0 0 14px;
    font-size: 0.9rem;
    border-left: 3px solid var(--accent);
  }
  .days {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 14px;
  }
  .day.today {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  h2 {
    margin: 0 0 6px;
    font-size: 1.15rem;
  }
  .weekday {
    text-transform: capitalize;
  }
  .meal {
    padding: 8px 0;
    border-top: 1px solid var(--line);
  }
  h3 {
    margin: 0 0 6px;
    font-family: var(--font);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--muted);
  }
  ul {
    display: grid;
    gap: 6px;
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
  }
  ul:empty {
    display: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
    font-weight: 600;
  }
  img,
  .ph {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 33px;
    border-radius: 6px;
    object-fit: cover;
    background: var(--surface-2);
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .badge {
    margin-left: 4px;
  }
  .actions {
    display: flex;
    gap: 2px;
  }
  .actions button,
  .add {
    border: 0;
    background: none;
    color: var(--muted);
    cursor: pointer;
    border-radius: 6px;
  }
  .actions button {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
  }
  .actions button:hover:not(:disabled),
  .add:hover {
    color: var(--accent);
    background: var(--surface-2);
  }
  .actions button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .add {
    padding: 4px 6px;
    font-weight: 600;
    font-size: 0.85rem;
  }
</style>
