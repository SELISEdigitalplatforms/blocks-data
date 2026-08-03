import { Trash } from "@/storage/pages/trash/trash";

const StorageTrashPage = () => {
  return (
    <main className="flex flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold md:text-2xl">Trash</h1>
      <Trash />
    </main>
  );
};

export default StorageTrashPage;
