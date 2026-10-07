<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## ProConta architecture
- Keep all fictitious domain data in src/lib/proconta/demo.ts so future API adapters can replace the demo source independently of presentation.
- Use focused page components and shared workspace elements in src/components/proconta; route files only provide typed routing and unique metadata.
- Share the workspace shell and context through the root outlet so client and period selection remain consistent across pages.
- Keep demo actions in session-only React state and never add accounting calculations or backend integrations during this UX phase.
- Define visual tokens and application layout in src/styles.css; use existing design-system controls for interactions.
