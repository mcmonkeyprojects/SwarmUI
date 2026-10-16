using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using NUnit.Framework;
using SwarmUI.Accounts;
using SwarmUI.Backends;
using SwarmUI.Builtin_GridGeneratorExtension;
using SwarmUI.Core;
using SwarmUI.Text2Image;
using SwarmUI.Utils;
using static SwarmUI.Backends.BackendHandler;
using static SwarmUI.Builtin_GridGeneratorExtension.GridGenCore;

namespace SwarmUITests;

[TestFixture, NonParallelizable]
public class BackendSchedulingTests : SwarmUITest
{
    [OneTimeSetUp]
    public static void PreInit()
    {
        Setup();
    }

    [TestCase(999, "none")]
    [TestCase(0, "none")]
    [TestCase(999, "failed")]
    [TestCase(999, "cancelled")]
    [TestCase(999, "interrupt")]
    public static void TestGridSubmissionOrder(int limit, string scenario)
    {
        using TestQueue queue = new(limit);
        BackendHandler previousBackend = Program.Backends;
        T2IRegisteredParam<string> previousPrompt = T2IParamTypes.Prompt, previousBackendType = T2IParamTypes.BackendType, previousBackendID = T2IParamTypes.ExactBackendID, previousPresets = GridGeneratorExtension.PresetsParameter;
        T2IRegisteredParam<T2IModel> previousModel = T2IParamTypes.Model;
        List<Action<T2IParamInput>> previousSpecial = T2IParamInput.SpecialParameterHandlers, previousLateSpecial = T2IParamInput.LateSpecialParameterHandlers;
        Action<T2IEngine.PreGenerationEventParams> previousPreGenerate = T2IEngine.PreGenerateEvent;
        Session session = new();
        using Session.GenClaim claim = session.Claim(3), independentClaim = session.Claim(1);
        using ManualResetEventSlim firstPreparing = new(), lastPrepared = new(), releaseFirst = new();
        GridGeneratorExtension.SwarmUIGridData data = new() { Claim = claim, MaxSimul = 3, ContinueOnError = true };
        GridGeneratorExtension.SwarmUIGridData independentData = new() { Claim = independentClaim, MaxSimul = 1 };
        GridRunner runner = new() { Grid = new() { LocalData = data }, TotalRun = 3 };
        GridRunner independentRunner = new() { Grid = new() { LocalData = independentData }, TotalRun = 1, Iteration = 1 };
        Task producer = null;
        try
        {
            Func<GridRunner, T2IParamInput, SingleGridCall, Task> submit = GetGridSubmitter();
            Program.Backends = queue.Handler;
            T2IParamTypes.Prompt = new(new("Prompt", "", "", ID: "prompt"));
            T2IParamTypes.BackendType = new(new("Backend Type", "", "", ID: "backendtype"));
            T2IParamTypes.ExactBackendID = new(new("Exact Backend ID", "", "", ID: "exactbackendid"));
            T2IParamTypes.Model = new(new("Model", "", "", ID: "model"));
            GridGeneratorExtension.PresetsParameter = new(new("Presets", "", "", ID: "presets"));
            T2IParamInput.SpecialParameterHandlers = [];
            T2IEngine.PreGenerateEvent = null;
            T2IParamInput.LateSpecialParameterHandlers = [input =>
            {
                if (input.Get(T2IParamTypes.Model).Name == "A")
                {
                    firstPreparing.Set();
                    Assert.That(releaseFirst.Wait(TimeSpan.FromSeconds(5)), Is.True);
                }
                else if (input.Get(T2IParamTypes.Model).Name == "B")
                {
                    if (scenario == "failed")
                    {
                        throw new SwarmReadableErrorException("Test preparation failed.");
                    }
                    if (scenario == "cancelled")
                    {
                        throw new OperationCanceledException("Test preparation cancelled.");
                    }
                }
                else if (input.Get(T2IParamTypes.Model).Name == "C")
                {
                    lastPrepared.Set();
                }
            }];
            producer = Task.Run(() =>
            {
                foreach (string model in new[] { "A", "B", "C" })
                {
                    T2IParamInput input = new(null);
                    input.Set(T2IParamTypes.Model, new T2IModel(null, "", model, model));
                    runner.Iteration++;
                    submit(runner, input, new(runner.Grid, []));
                }
            });
            Assert.That(firstPreparing.Wait(TimeSpan.FromSeconds(5)), Is.True);
            Assert.That(lastPrepared.Wait(TimeSpan.FromSeconds(5)), Is.True);
            Assert.That(producer.Wait(TimeSpan.FromSeconds(5)), Is.True);
            if (limit > 0)
            {
                if (scenario == "failed" || scenario == "cancelled")
                {
                    Assert.That(SpinWait.SpinUntil(() => data.Rendering[1].IsCompleted, TimeSpan.FromSeconds(5)), Is.True);
                }
                Assert.That(data.Rendering[2].Wait(100), Is.False);
                Assert.That(queue.Handler.QueuedRequests, Is.Zero);
            }
            else
            {
                Assert.That(SpinWait.SpinUntil(() => queue.Handler.QueuedRequests == 2, TimeSpan.FromSeconds(5)), Is.True);
            }
            T2IParamInput independentInput = new(null);
            independentInput.Set(T2IParamTypes.Model, new T2IModel(null, "", "D", "D"));
            submit(independentRunner, independentInput, new(independentRunner.Grid, []));
            Assert.That(SpinWait.SpinUntil(() => queue.Handler.T2IBackendRequests.Values.Any(r => r.Model.Name == "D"), TimeSpan.FromSeconds(5)), Is.True);
            if (scenario == "interrupt")
            {
                claim.LocalClaimInterrupt.Cancel();
                Assert.That(Task.WaitAll([data.Rendering[1], data.Rendering[2]], TimeSpan.FromSeconds(5)), Is.True);
                Assert.That(data.Rendering[0].IsCompleted, Is.False);
                Assert.That(queue.Handler.T2IBackendRequests.Values.Select(r => r.Model.Name), Is.EqualTo(new[] { "D" }));
                releaseFirst.Set();
                Assert.That(Task.WaitAll([.. data.Rendering], TimeSpan.FromSeconds(5)), Is.True);
                Assert.That(queue.Handler.T2IBackendRequests.Values.Select(r => r.Model.Name), Is.EqualTo(new[] { "D" }));
            }
            else
            {
                releaseFirst.Set();
                string[] expected = scenario == "none" ? ["A", "B", "C"] : ["A", "C"];
                Assert.That(SpinWait.SpinUntil(() => queue.Handler.QueuedRequests == expected.Length + 1, TimeSpan.FromSeconds(5)), Is.True);
                string[] admitted = [.. queue.Handler.T2IBackendRequests.Values.OrderBy(r => r.ID).Select(r => r.Model.Name)];
                if (limit > 0)
                {
                    Assert.That(admitted, Is.EqualTo(new[] { "D" }.Concat(expected)));
                }
                else
                {
                    Assert.That(admitted.Take(2), Is.EquivalentTo(new[] { "B", "C" }));
                    Assert.That(admitted.Skip(2), Is.EqualTo(new[] { "D", "A" }));
                }
            }
        }
        finally
        {
            try
            {
                session.SessInterrupt.Cancel();
                claim.LocalClaimInterrupt.Cancel();
                independentClaim.LocalClaimInterrupt.Cancel();
                releaseFirst.Set();
                Assert.That(producer?.Wait(TimeSpan.FromSeconds(5)) ?? true, Is.True);
                Task cleanup = Task.WhenAll([.. data.Rendering, .. independentData.Rendering]).ContinueWith(_ => { });
                Assert.That(cleanup.Wait(TimeSpan.FromSeconds(5)), Is.True);
            }
            finally
            {
                Program.Backends = previousBackend;
                T2IParamTypes.Prompt = previousPrompt;
                T2IParamTypes.BackendType = previousBackendType;
                T2IParamTypes.ExactBackendID = previousBackendID;
                T2IParamTypes.Model = previousModel;
                GridGeneratorExtension.PresetsParameter = previousPresets;
                T2IParamInput.SpecialParameterHandlers = previousSpecial;
                T2IParamInput.LateSpecialParameterHandlers = previousLateSpecial;
                T2IEngine.PreGenerateEvent = previousPreGenerate;
                session.SessInterrupt.Dispose();
            }
        }
    }

    private static Func<GridRunner, T2IParamInput, SingleGridCall, Task> GetGridSubmitter()
    {
        (string, string, List<string>) assets = (ASSETS_DIR, EXTRA_FOOTER, EXTRA_ASSETS);
        Action<SingleGridCall, T2IParamInput, bool> apply = GridCallApplyHook;
        Func<SingleGridCall, string, string, bool> add = GridCallParamAddHook;
        Action<GridRunner> preRun = GridRunnerPreRunHook, preDry = GridRunnerPreDryHook, postProcess = PostPreprocessCallback;
        Action<SingleGridCall> init = GridCallInitHook;
        Func<GridRunner, T2IParamInput, SingleGridCall, Task> submit = GridRunnerPostDryHook;
        Dictionary<string, T2IParamType> types = T2IParamTypes.Types;
        JObject languageKeys = LanguagesHelper.DebugSet;
        (T2IRegisteredParam<string>, T2IRegisteredParam<string>, T2IRegisteredParam<string>) parameters = (GridGeneratorExtension.PromptReplaceParameter, GridGeneratorExtension.PromptAddParameter, GridGeneratorExtension.PresetsParameter);
        try
        {
            EXTRA_ASSETS = [];
            T2IParamTypes.Types = [];
            LanguagesHelper.DebugSet = new();
            new GridGeneratorExtension().OnPreInit();
            return GridRunnerPostDryHook;
        }
        finally
        {
            (ASSETS_DIR, EXTRA_FOOTER, EXTRA_ASSETS) = assets;
            GridCallApplyHook = apply;
            GridCallParamAddHook = add;
            GridRunnerPreRunHook = preRun;
            GridRunnerPreDryHook = preDry;
            PostPreprocessCallback = postProcess;
            GridCallInitHook = init;
            GridRunnerPostDryHook = submit;
            T2IParamTypes.Types = types;
            LanguagesHelper.DebugSet = languageKeys;
            (GridGeneratorExtension.PromptReplaceParameter, GridGeneratorExtension.PromptAddParameter, GridGeneratorExtension.PresetsParameter) = parameters;
        }
    }

    [TestCase(1)]
    [TestCase(2)]
    public static void TestRequestOrderAcrossModelChanges(int maxUsages)
    {
        using TestQueue queue = new();
        FakeBackend backend = queue.AddBackend(maxUsages: maxUsages);
        string[] models = ["A", "A", "B", "B", "B", "A", "A"];
        T2IBackendRequest[] requests = [.. models.Select(model => queue.AddRequest(model))];
        backend.BackendData.Usages = maxUsages;
        foreach (T2IBackendRequest request in requests)
        {
            request.TryFind();
        }
        backend.BackendData.Usages = 0;
        queue.Start();
        foreach (T2IBackendRequest request in requests)
        {
            Assert.That(SpinWait.SpinUntil(() => Volatile.Read(ref request.Result) is not null, TimeSpan.FromSeconds(5)), Is.True);
            using T2IBackendAccess access = request.Result;
            request.Complete();
            Assert.That(access.Backend.CurrentModelName, Is.EqualTo(request.Model.Name));
        }
        Assert.That(backend.LoadedModels, Is.EqualTo(new[] { "A", "B", "A" }));
    }

    [TestCase(0, "B")]
    [TestCase(3, "B")]
    [TestCase(999, "A")]
    public static void TestForcedOrderLimit(int limit, string firstModel)
    {
        using TestQueue queue = new(limit);
        FakeBackend backend = queue.AddBackend();
        T2IBackendRequest[] requests = [queue.AddRequest("A"), queue.AddRequest("B"), queue.AddRequest("B")];
        backend.BackendData.Usages = 2;
        foreach (T2IBackendRequest request in requests)
        {
            request.TryFind();
        }
        backend.BackendData.Usages = 0;
        queue.Start();
        Assert.That(SpinWait.SpinUntil(() => requests.Any(r => Volatile.Read(ref r.Result) is not null), TimeSpan.FromSeconds(5)), Is.True);
        Assert.That(backend.LoadedModels[0], Is.EqualTo(firstModel));
        Assert.That(requests.Where(r => r.Model.Name != firstModel).All(r => r.Result is null), Is.True);
    }

    [Test]
    public static void TestRequestOrderAfterBackendRelease()
    {
        using TestQueue queue = new();
        FakeBackend backend = queue.AddBackend("A", 1);
        using T2IBackendAccess active = new(backend.BackendData);
        T2IBackendRequest first = queue.AddRequest("B"), later = queue.AddRequest("A");
        first.TryFind(true);
        active.Dispose();
        later.TryFind(true);
        Assert.That(later.Result, Is.Null);
        Assert.That(backend.BackendData.ReserveModelLoad, Is.False);
        queue.Scheduler.Run(() => first.TryFind(true));
        Assert.That(backend.BackendData.ReserveModelLoad, Is.True);
        queue.Scheduler.RunNext();
        Assert.That(backend.LoadedModels, Is.EqualTo(new[] { "B" }));
    }

    [Test]
    public static void TestRequestOrderAfterModelLoad()
    {
        using TestQueue queue = new();
        FakeBackend backend = queue.AddBackend();
        T2IBackendRequest first = queue.AddRequest("A"), later = queue.AddRequest("B");
        queue.Scheduler.Run(() => first.TryFind(true));
        Assert.That(backend.BackendData.ReserveModelLoad, Is.True);
        queue.Scheduler.RunNext();
        later.TryFind(true);
        Assert.That(later.Result, Is.Null);
        Assert.That(backend.BackendData.ReserveModelLoad, Is.False);
        first.TryFind(true);
        Assert.That(first.Result, Is.Not.Null);
        Assert.That(backend.LoadedModels, Is.EqualTo(new[] { "A" }));
    }

    [Test]
    public static void TestModelLoadWaitsForBackendRelease()
    {
        using TestQueue queue = new();
        FakeBackend backend = queue.AddBackend("A");
        using T2IBackendAccess active = new(backend.BackendData);
        T2IBackendRequest next = queue.AddRequest("B"), later = queue.AddRequest("A");
        queue.Scheduler.Run(() => next.TryFind(true));
        Task worker = queue.StartWorker();
        later.TryFind(true);
        Assert.That(backend.BackendData.ReserveModelLoad, Is.True);
        Assert.That(later.Result, Is.Null);
        Assert.That(backend.LoadEntered.Wait(100), Is.False);
        Assert.That(backend.CurrentModelName, Is.EqualTo("A"));
        active.Dispose();
        Assert.That(worker.Wait(TimeSpan.FromSeconds(5)), Is.True);
        next.TryFind(true);
        Assert.That(next.Result?.Backend.CurrentModelName, Is.EqualTo("B"));
    }

    [Test]
    public static void TestSameModelRequestsShareBackend()
    {
        using TestQueue queue = new();
        FakeBackend backend = queue.AddBackend("A");
        T2IBackendRequest first = queue.AddRequest("A"), second = queue.AddRequest("A");
        first.TryFind(true);
        second.TryFind(true);
        Assert.That(first.Result, Is.Not.Null);
        Assert.That(second.Result, Is.Not.Null);
        Assert.That(backend.BackendData.Usages, Is.EqualTo(2));
        Assert.That(backend.LoadedModels, Is.Empty);
    }

    [Test]
    public static void TestFilteredRequestDoesNotBlockOtherBackends()
    {
        using TestQueue queue = new();
        FakeBackend firstBackend = queue.AddBackend("A", 1), secondBackend = queue.AddBackend("B");
        using T2IBackendAccess active = new(firstBackend.BackendData);
        T2IBackendRequest first = queue.AddRequest("A"), second = queue.AddRequest("B");
        first.Filter = b => b.ID == firstBackend.BackendData.ID;
        first.TryFind(true);
        Assert.That(first.Result, Is.Null);
        Assert.That(first.Pressure.IsLoading, Is.False);
        second.TryFind(true);
        Assert.That(second.Result?.Backend, Is.SameAs(secondBackend));
        active.Dispose();
        first.TryFind(true);
        Assert.That(first.Result?.Backend, Is.SameAs(firstBackend));
    }

    [Test]
    public static void TestModelLoadDoesNotBlockOtherBackends()
    {
        using TestQueue queue = new();
        FakeBackend firstBackend = queue.AddBackend(), secondBackend = queue.AddBackend("B");
        T2IBackendRequest first = queue.AddRequest("A"), second = queue.AddRequest("B");
        firstBackend.BackendData.TimeLastRelease = -1;
        first.TryFind(true);
        first.Pressure.TimeFirstRequest -= 2000;
        queue.Scheduler.Run(() => first.TryFind(true));
        second.TryFind(true);
        Assert.That(second.Result?.Backend, Is.SameAs(secondBackend));
        queue.Scheduler.RunNext();
    }

    [TestCase("cancelled")]
    [TestCase("scaling")]
    [TestCase("hook")]
    public static void TestIneligibleRequestDoesNotBlockQueue(string reason)
    {
        using TestQueue queue = new();
        queue.AddBackend("B");
        T2IBackendRequest first = queue.AddRequest("A"), second = queue.AddRequest("B");
        if (reason == "cancelled")
        {
            first.Cancel = new CancellationToken(true);
        }
        else if (reason == "scaling")
        {
            first.WaitingOnScalingAttempt = new TaskCompletionSource<bool>().Task;
        }
        else
        {
            CanTryFindNow.Add(r => r != first);
        }
        second.TryFind(true);
        Assert.That(second.Result, Is.Not.Null);
    }

    [Test]
    public static void TestModelLoadReservationBeforeWorkerStarts()
    {
        using TestQueue queue = new();
        FakeBackend backend = queue.AddBackend();
        T2IBackendRequest first = queue.AddRequest("A"), second = queue.AddRequest("B");
        queue.Scheduler.Run(() =>
        {
            first.TryFind();
            Assert.That(backend.BackendData.ReserveModelLoad, Is.True);
            second.TryFind();
        });
        Assert.That(queue.Scheduler.Pending.Count, Is.EqualTo(1));
        queue.Scheduler.RunNext();
        Assert.That(backend.LoadedModels, Is.EqualTo(new[] { "A" }));
        Assert.That(backend.BackendData.ReserveModelLoad, Is.False);
    }

    [TestCase(false)]
    [TestCase(true)]
    public static void TestModelLoadSurvivesRequestCancellation(bool beforeWorkerStarts)
    {
        using TestQueue queue = new();
        using CancellationTokenSource cancel = new();
        FakeBackend backend = queue.AddBackend();
        backend.LoadGate = new(TaskCreationOptions.RunContinuationsAsynchronously);
        T2IBackendRequest first = queue.AddRequest("A"), second = queue.AddRequest("A");
        first.Cancel = cancel.Token;
        queue.Scheduler.Run(() => first.TryFind(true));
        if (beforeWorkerStarts)
        {
            cancel.Cancel();
        }
        Task worker = queue.StartWorker();
        Assert.That(backend.LoadEntered.Wait(TimeSpan.FromSeconds(5)), Is.True);
        cancel.Cancel();
        first.Complete();
        Assert.That(worker.Wait(100), Is.False);
        second.TryFind(true);
        Assert.That(second.Result, Is.Null);
        Assert.That(backend.BackendData.ReserveModelLoad, Is.True);
        backend.LoadGate.SetResult();
        Assert.That(worker.Wait(TimeSpan.FromSeconds(5)), Is.True);
        Assert.That(backend.BackendData.ReserveModelLoad, Is.False);
        second.TryFind(true);
        Assert.That(second.Result, Is.Not.Null);
    }

    private class FakeBackend : AbstractT2IBackend
    {
        public List<string> LoadedModels = [];
        public ManualResetEventSlim LoadEntered = new();
        public TaskCompletionSource LoadGate;

        public override IEnumerable<string> SupportedFeatures => [];
        public override Task Init() => Task.CompletedTask;
        public override Task Shutdown() => Task.CompletedTask;

        public override Task<Image[]> Generate(T2IParamInput input) => Task.FromResult(Array.Empty<Image>());

        public override async Task<bool> LoadModel(T2IModel model, T2IParamInput input)
        {
            LoadedModels.Add(model.Name);
            LoadEntered.Set();
            if (LoadGate is not null)
            {
                await LoadGate.Task.ConfigureAwait(false);
            }
            CurrentModelName = model.Name;
            return true;
        }
    }

    private class HeldTaskScheduler : TaskScheduler
    {
        public Queue<Task> Pending = new();

        protected override IEnumerable<Task> GetScheduledTasks() => Pending.ToArray();
        protected override void QueueTask(Task task) => Pending.Enqueue(task);
        protected override bool TryExecuteTaskInline(Task task, bool taskWasPreviouslyQueued) => false;

        public void Run(Action action)
        {
            Task task = Task.Factory.StartNew(action, CancellationToken.None, TaskCreationOptions.None, this);
            Assert.That(Pending.Dequeue(), Is.SameAs(task));
            TryExecuteTask(task);
            task.GetAwaiter().GetResult();
        }

        public void RunNext()
        {
            Task task = Pending.Dequeue();
            TryExecuteTask(task);
            task.GetAwaiter().GetResult();
        }
    }

    private class TestQueue : IDisposable
    {
        public BackendHandler Handler;
        public HeldTaskScheduler Scheduler = new();
        private List<T2IBackendRequest> Requests = [];
        private List<Task> Workers = [];
        private Task Loop;
        private TrackingTaskScheduler LiveScheduler = new();
        private Settings PreviousSettings = Program.ServerSettings;
        private Dictionary<string, T2IModelHandler> PreviousModels = Program.T2IModelSets;
        private Action PreviousRefresh = Program.ModelRefreshEvent;
        private List<Func<T2IBackendRequest, bool>> PreviousChecks = CanTryFindNow;
        private CancellationToken PreviousCancel = Program.GlobalProgramCancel;
        private CancellationTokenSource Stop = new();

        public TestQueue(int limit = 999)
        {
            Program.ServerSettings = new();
            Program.ServerSettings.Backends.MaxRequestsForcedOrder = limit;
            Program.T2IModelSets = new() { ["Stable-Diffusion"] = new() };
            Program.GlobalProgramCancel = Stop.Token;
            CanTryFindNow = [];
            Handler = new();
            Handler.T2IBackendRequests = new(1, 37);
        }

        public FakeBackend AddBackend(string model = null, int maxUsages = 2)
        {
            FakeBackend backend = new() { Handler = Handler, Status = BackendStatus.RUNNING, CurrentModelName = model, MaxUsages = maxUsages };
            T2IBackendData data = new() { Backend = backend, BackType = Handler.SwarmBackendType, ID = Handler.Count };
            backend.BackendData = data;
            Handler.AllBackends[data.ID] = data;
            return backend;
        }

        public T2IBackendRequest AddRequest(string model)
        {
            T2IBackendRequest request = new() { Handler = Handler, Model = new(null, "", model, model), ID = 34 + Requests.Count, Cancel = Stop.Token };
            Handler.T2IBackendRequests[request.ID] = request;
            Requests.Add(request);
            return request;
        }

        public void Start()
        {
            Loop = Task.Factory.StartNew(Handler.RequestHandlingLoop, CancellationToken.None, TaskCreationOptions.None, LiveScheduler);
        }

        public Task StartWorker()
        {
            Task worker = Task.Run(Scheduler.RunNext);
            Workers.Add(worker);
            return worker;
        }

        public void Dispose()
        {
            try
            {
                Stop.Cancel();
                Handler.CheckBackendsSignal.Set();
                Assert.That(Loop?.Wait(TimeSpan.FromSeconds(5)) ?? true, Is.True);
                foreach (T2IBackendRequest request in Requests)
                {
                    request.Result?.Dispose();
                }
                foreach (T2IBackendData data in Handler.EnumerateT2IBackends)
                {
                    ((FakeBackend)data.Backend).LoadGate?.TrySetResult();
                    data.Usages = 0;
                }
                Assert.That(Task.WaitAll([.. Workers, .. LiveScheduler.Tasks], TimeSpan.FromSeconds(5)), Is.True);
                while (Scheduler.Pending.Count > 0)
                {
                    Scheduler.RunNext();
                }
                Assert.That(Handler.EnumerateT2IBackends.All(b => !b.ReserveModelLoad), Is.True);
            }
            finally
            {
                Program.ServerSettings = PreviousSettings;
                Program.T2IModelSets = PreviousModels;
                Program.ModelRefreshEvent = PreviousRefresh;
                CanTryFindNow = PreviousChecks;
                Program.GlobalProgramCancel = PreviousCancel;
                Stop.Dispose();
            }
        }
    }

    private class TrackingTaskScheduler : TaskScheduler
    {
        public ConcurrentBag<Task> Tasks = [];

        protected override IEnumerable<Task> GetScheduledTasks() => Tasks.ToArray();
        protected override bool TryExecuteTaskInline(Task task, bool taskWasPreviouslyQueued) => false;

        protected override void QueueTask(Task task)
        {
            Tasks.Add(task);
            ThreadPool.QueueUserWorkItem(_ => TryExecuteTask(task));
        }
    }
}
